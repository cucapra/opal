import { World, TopWorld, Weight, Collection, ExternalCollection, Edit } from './world';
import * as PSet from './pset';
import { orderBy, nchk } from './util';
import * as distributed from './distributed';
import { OpalNode } from './distributed';
export { World, Weight, Collection, ExternalCollection, Edit, PSet, OpalNode };


/**
 * The type of async functions used as the "body" of OPAL worlds.
 */
export type AsyncFunc = (ctx: Context) => Promise<void>;


/**
 * A wrapper for all the API calls available to OPAL code.
 *
 * A Context keeps track of the code's current OPAL world and provides
 * convenient ways to access it.
 */
export class Context {
    constructor(public world: World, private localNode?: OpalNode) { }

    /**
     * Create a new child world.
     *
     * @param func  The body code to execute in the new `World`.
     * @returns     A new `World` object.
     */
    hypothetical(func: AsyncFunc): World {
        let world: World = new World(this.world, () => func(new Context(world, this.localNode)));
        this.world.subworlds.add(world);
        return world;
    }

    async executeAt(node: distributed.OpalNode, func: (ctx: Context, ...params: (Weight<any> | Collection<any> | OpalNode)[]) => Promise<void>, ...params: [string, (Weight<any> | Collection<any> | OpalNode)][]): Promise<void> {
        await distributed.executeAt(this, node, func, params);
    }

    async executeWith(node: distributed.OpalNode, func: (ctx: Context, node: OpalNode) => Promise<void>): Promise<void> {
        let token = await distributed.requestToken(this.localNode as OpalNode, node, func.toString());
        let phony = distributed.tokenizeRemoteNode(node, token);
        await func(this, phony as any);
    }

    /**
     * Create a new `Weight` for communication between this world and a subworld.
     */
    weight<T>(): Weight<T> {
        return new Weight<T>(this.world);
    }

    /**
     * Set the value of a `Weight`.
     */
    async set<T>(weight: Weight<T>, value: T) {
        weight.set(this.world, value);
        await this.world.suspend();
    }

    /**
     * Get the value of a `Weight`.
     */
    async get<T>(weight: Weight<T>, subworld: World) {
        let promise = (async function() {
            let result = await weight.get(subworld);
            subworld.release();
            return result;
        })();
        subworld.acquire();
        return await promise;
    }

    /**
     * Create a new `Collection` based in this world.
     */
    collection<T>(constructor?: (world: World) => Collection<T>): Collection<T> {
        let c: Collection<T>;
        if (constructor) {
            c = constructor(this.world);
        } else {
            c = new Collection<T>(this.world);
        }
        this.world.collections.add(c);
        return c;
    }

    /**
     * Add a value to a `Collection`.
     */
    add<T>(collection: Collection<T>, value: T) {
        let s = PSet.add(collection.lookup(this.world), value);
        collection.update(this.world, s);
        this.world.collections.add(collection);
    }

    /**
     * Remove a value from a `Collection`.
     */
    del<T>(collection: Collection<T>, value: T) {
        let s = PSet.del(collection.lookup(this.world), value);
        collection.update(this.world, s);
        this.world.collections.add(collection);
    }

    /**
     * Get the current contents of a collection as an `Iterable`.
     *
     * You can use `Array.from()` to get a JavaScript array from the iterable.
     */
    view<T>(collection: Collection<T>) {
        return collection.lookup(this.world).view();
    }

    /**
     * Get the contents of a collection *without* any local modifications.
     */
    clean_view<T>(collection: Collection<T>) {
        console.assert(this.world.parent !== null,
            "clean_view() not available in top-level world");
        let cur_set = collection.lookup(this.world);
        let parent_set = collection.lookup(nchk(this.world.parent));
        let ancestor = PSet.common(parent_set, cur_set);
        if (ancestor === null) {
            throw "child unrelated to parent!";
        }
        return ancestor.view();
    }

    /**
     * Get the set of changes that *would* be made to a collection if the
     * current world were committed into its parent.
     */
    diff<T>(collection: Collection<T>): Edit<T> {
        console.assert(this.world.parent !== null,
            "diff() not available in top-level world");
        let cur_set = collection.lookup(this.world);
        let parent_set = collection.lookup(nchk(this.world.parent));
        return new Edit(PSet.diff(parent_set, cur_set));
    }

    /**
     * Get the set of changes in a child world that would be made if we were to
     * commit it here.
     */
    diff_child<T>(world: World, collection: Collection<T>): Edit<T> {
        console.assert(world.parent === this.world,
            "diff_child() must be called on a child world");
        let child_set = collection.lookup(world);
        let parent_set = collection.lookup(this.world);
        return new Edit(PSet.diff(parent_set, child_set));
    }

    /**
     * Apply all the state updates from a subworld.
     *
     * This runs the subworld to completion and then merges all of its updates
     * to `Collection`s into the current world.
     */
    async commit(subworld: World) {
        // Complete executing the world in question.
        subworld.acquire();
        await subworld.finish();

        // Merge all of its modified Collections.
        for (let coll of subworld.collections) {
            await coll.merge(subworld);
        }
    }

    /**
     * "Fork" several hypothetical worlds.
     *
     * @param domain  Create a new world for each value in the domain. The
     *                domain may be infinite.
     * @param func    The body of the new worlds, paramterized by a
     *                value selected from the domain.
     * @returns       An iterable of new `World`s (with the same cardinality
     *                as `domain`).
     */
    * explore<T>(domain: Iterable<T>,
        func: (choice: T) => AsyncFunc): Iterable<World> {
        for (let value of domain) {
            yield this.hypothetical(func(value));
        }
    }

    /**
     * Find the `World` that minimizes a given weight.
     *
     * @param worlds   The sequence of `World`s to search.
     * @param weight   The numerical weight to minimize.
     * @param limit    Optionally, the maximum number of worlds to consider.
     */
    async minimize(worlds: Iterable<World>, weight: Weight<number>, limit?: number) {
        return (await this.minimize_k(worlds, weight, 1, limit))[0];
    }

    /**
     * Find *k* worlds that minimize a weight.
     *
     * @param worlds   The sequence of `World`s to search. Could be produced
     *                 by `explore`, for example.
     * @param weight   The numerical weight to minimize.
     * @param count    Return at most `count` worlds.
     * @param limit    Optionally, the maximum number of worlds to consider.
     *                 Otherwise, all worlds are searched. If the `worlds`
     *                 sequence is infinite, you definitely want to provide
     *                 a limit.
     */
    async minimize_k(worlds: Iterable<World>, weight: Weight<number>,
        count: number, limit?: number) {
        // Get the worlds and their weights.
        let worlds_flat: { world: World, value: number }[] = [];
        for (let world of worlds) {
            worlds_flat.push({
                world,
                value: await this.get(weight, world),
            });
            if (limit && worlds_flat.length >= limit) {
                break;
            }
        }

        // Sort by weight and return the prefix.
        worlds_flat.sort(orderBy((p: { world: World, value: number }) => p.value));
        return worlds_flat.slice(0, count).map((p) => p.world);
    }
}


/**
 * Create and invoke a top-level OPAL world.
 *
 * @returns A promise that resolves when OPAL execution finishes.
 */
export async function opal(func: AsyncFunc, node?: OpalNode): Promise<void> {
    let world: World = new TopWorld(() => func(new Context(world, node)));
    world.acquire();  // Run to completion.
    let res = await Promise.race([
        world.finish(),
        node !== undefined ? distributed.launchOpalServer(node) : Promise.resolve({})
    ]);
    if (typeof res === "string") {
        throw Error(`Opal server failed with ${res}`);
    }
}
