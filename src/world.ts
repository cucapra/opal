/**
 * This module deals with collections, weights, and hypothetical worlds in
 * OPAL programming. It contains the basic machinery for lazy cooperative
 * multithreading.
 */

import * as PSet from './pset';
import { nchk } from './util';


/**
 * A promise utility for delayed resolution.
 *
 * This is useful when you want to call `then` on a promise but you don't know
 * where the "upstream" part of the chain will come from yet. Later, when you
 * want to complete the chain, you can call `resolve()` or `reject()` or even
 * connect up another promise with `.then(jar.resolve, jar.reject)`.
 */
class PromiseJar<T> {
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject: (e: any) => void;

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}


//
/**
 * A communication channel between hypothetical worlds and their parents.
 *
 * A child world can write to a weight using `ctx.set` and its parent can
 * read that value using `ctx.get`.
 */
export class Weight<T> {
    private jars: Map<World, PromiseJar<T>>;

    /**
     * Create a new weight.
     *
     * @param world   The parent ("home") world.
     */
    constructor(public world: World) {
        this.jars = new Map();
    }

    private jar(world: World): PromiseJar<T> {
        if (this.jars.has(world)) {
            return this.jars.get(world) !;
        } else {
            let s = new PromiseJar<T>();
            this.jars.set(world, s);
            world.finish().then(s.reject);
            return s;
        }
    }

    /**
     * Set the weight's value for a given child world.
     */
    set(world: World, value: T) {
        this.jar(world).resolve(value);
    }

    /**
     * Get the weight's value for a given child world.
     */
    get(world: World): Promise<T> {
        return this.jar(world).promise;
    }
}


/**
 * A world-aware set data structure.
 *
 * Worlds have isolated views onto `Collection`s: the changes they make will
 * only be visible to themselves until they are committed.
 */
export class Collection<T> {
    /**
     * The underlying `PSet`s for each world that has an interest in this
     * `Collection`.
     */
    sets: Map<World, PSet.Node<T>>;

    /**
     * Create a new `Collection`.
     *
     * @param owner  The parent ("home") world for the collection.
     * @param init   Optionally, the initial set for the owner world. Otherwise,
     *               the set starts out empty.
     */
    constructor(public owner: World, init?: PSet.Node<T>) {
        if (!init) {
            init = PSet.set<T>();
        }

        this.sets = new Map();
        this.sets.set(owner, init);
    }

    /**
     * Get the underlying PSet for a given World.
     *
     * If the set does not exist yet, create it as a snapshot of the
     * world's parent's view.
     */
    lookup(world: World): PSet.Node<T> {
        if (this.sets.has(world)) {
            return this.sets.get(world) !;
        } else {
            console.assert(world.parent != null,
                "collection not defined in any ancestor");
            let parent_set = this.lookup(nchk(world.parent));
            this.sets.set(world, parent_set);
            return parent_set;
        }
    }

    /**
     * Replace the current set for a given world.
     *
     * The world must have an old set associated with it.
     */
    async update(world: World, set: PSet.Node<T>) {
        console.assert(this.sets.has(world),
            "updating set that does not exist: %j not in %j", world, this.sets);
        this.sets.set(world, set);
    }

    /**
     * Apply any updates in a child world to its parent's view of the
     * collection.
     */
    async merge(world: World) {
        if (this.sets.has(world)) {
            let child_set = this.sets.get(world) !;
            let parent_set = this.lookup(nchk(world.parent));
            await this.update(nchk(world.parent), PSet.merge(parent_set, child_set));
        }
    }
}

/**
 * An *external collection* is a `Collection` where updates affect the
 * world outside of OPAL.
 *
 * Subclasses override the `send` method to implement their semantics.
 */
export abstract class ExternalCollection<T> extends Collection<T> {
    /**
     * Apply a new sequence of operations to the "real world."
     *
     * This is called whenever operations are applied in the top-level OPAL
     * world or committed to the top-level world from some child world.
     */
    abstract async send(old: PSet.Node<T>, ops: PSet.Operation<T>[]): Promise<PSet.Node<T>>;

    async update(world: World, set: PSet.Node<T>) {
        if (world instanceof TopWorld) {
            // Assume for now that the new set is a *descendant* of the old set, so
            // we just need to replay the operations "in between" the old and new
            // sets.
            let old = this.lookup(world);
            let log = set.log(old);
            let newset = await this.send(old, log);
            await super.update(world, newset);
        } else {
            await super.update(world, set);
        }
    }
}

/**
 * An *edit* contains a set of hypothetical changes to a collection.
 */
export class Edit<T> {
    constructor(private ops: PSet.Operation<T>[]) { }

    /**
     * Compute a score for this diff.
     *
     * @param scoring  A function that assigns a score to any value. This is
     *                 used as a positive weight for newly added items and a
     *                 negative weight for newly removed items.
     * @returns        The total score.
     */
    score(scoring: (value: T) => number): number {
        let total = 0;
        this.foreach({
            add(value) {
                total += scoring(value);
            },
            delete(value) {
                total -= scoring(value);
            },
        });
        return total;
    }

    /**
     * Loop over the actions in a diff.
     *
     * @param actions  A struct containing functions indicating what to do with
     *                 each operation type.
     */
    foreach(actions: EditActions<T>) {
        for (let op of this.ops) {
            if (op instanceof PSet.Add && actions.add) {
                actions.add(op.value);
            } else if (op instanceof PSet.Delete && actions.delete) {
                actions.delete(op.value);
            }
        }
    }
}

/**
 * A struct containing actions for `Edit.foreach`.
 */
export interface EditActions<T> {
    add?: (value: T) => void;
    delete?: (value: T) => void;
}


/**
 * An abstract mechanism for coordinating lazy evaluation via promises.
 *
 * This provides the functionality for Worlds that lets them suspend
 * themselves (voluntarily) and *only* run when demanded to. Specifically,
 * the computation only advances when `acquire` has been called more times
 * than `release`.
 */
export class Lazy {
    /**
     * The next step to take, when this thread is suspended.
     */
    private next: (() => void) | null;

    /**
     * The number of times this thread has been acquired.
     */
    private waiters: number;

    /**
     * A promise that is triggered when the thread completes.
     */
    private finish_jar: PromiseJar<void>;

    constructor() {
        this.waiters = 0;
        this.next = null;
        this.finish_jar = new PromiseJar<void>();
    }

    /**
     * Load the function to execute.
     *
     * Threads start in a suspended state, so you have to call `acquire`
     * after this to get the thread to actually start executing.
     */
    run(func: () => Promise<void>) {
        this.next = () => {
            let p = func();

            // When the function succeeds, notify anyone who called `finish()`.
            // Handle and log errors in user code.
            p.then(this.finish_jar.resolve,
                (err) => {
                    if (err.stack) {
                        console.error(err.stack);
                    } else {
                        console.error(err);
                    }
                });
        };
    }

    /**
     * Get a promise that you can `await` to get called when this thread
     * has finished executing.
     */
    finish(): Promise<void> {
        return this.finish_jar.promise;
    }

    /**
     * Instruct the thread to start executing eagerly. It will keep
     * executing until you call `release`.
     */
    acquire() {
        this.waiters++;
        if (this.next) {
            console.assert(this.waiters === 1);
            let next = this.next;
            this.next = null;
            next();
        }
    }

    /**
     * Tell the thread that you no longer need it to execute eagerly,
     * balancing an earlier `acquire` call.
     */
    release() {
        this.waiters--;
        console.assert(this.waiters >= 0);
        console.assert(this.next === null);
    }

    /**
     * Check whether anyone has called `acquire` but not `release`; i.e.,
     * anyone wants us to execute eagerly at the moment.
     */
    active() {
        return this.waiters > 0;
    }

    /**
     * Suspend execution *unless the thread is active*.
     */
    suspend(): Promise<void> {
        if (this.active()) {
            // We're active, so just continue executing.
            return Promise.resolve();
        } else {
            // Inactive, so actually suspend operation by saving the continuation.
            return new Promise<void>((resolve, reject) => {
                this.next = resolve;
            });
        }
    }
}


/**
 * An isolated thread of execution. In other words, a dynamic instance of an
 * OPAL `hypothetical` block.
 */
export class World extends Lazy {
    subworlds: Set<World>;

    /**
     * Collections used (or created) in this world.
     */
    collections: Set<Collection<any>>;

    constructor(public parent: World | null, thunk: () => Promise<void>) {
        super();
        this.subworlds = new Set();
        this.collections = new Set();
        this.run(thunk);
    }
}


/**
 * The top-level `World`.
 *
 * It is distinct from all other worlds because its actions can affect
 * the world outside of OPAL.
 */
export class TopWorld extends World {
    constructor(thunk: () => Promise<void>) {
        super(null, thunk);
    }
}
