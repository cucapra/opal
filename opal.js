'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, Promise, generator) {
    return new Promise(function (resolve, reject) {
        generator = generator.call(thisArg, _arguments);
        function cast(value) { return value instanceof Promise && value.constructor === Promise ? value : new Promise(function (resolve) { resolve(value); }); }
        function onfulfill(value) { try { step("next", value); } catch (e) { reject(e); } }
        function onreject(value) { try { step("throw", value); } catch (e) { reject(e); } }
        function step(verb, value) {
            var result = generator[verb](value);
            result.done ? resolve(result.value) : cast(result.value).then(onfulfill, onreject);
        }
        step("next", void 0);
    });
};
// A simple "holder" for a promise that keeps its callbacks for later use.
// This is useful when you want to call `then` on a promise but you don't know
// where the "upstream" part of the chain will come from yet. Later, when you
// want to complete the chain, you can call `resolve()` or `reject()` or even
// connect up another promise with `.then(jar.resolve, jar.reject)`.
class PromiseJar {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}
// A communication channel between hypothetical worlds and their parents.
class Weight {
    constructor(world) {
        this.world = world;
        this.jars = new Map();
    }
    jar(world) {
        if (this.jars.has(world)) {
            return this.jars.get(world);
        }
        else {
            let s = new PromiseJar();
            this.jars.set(world, s);
            return s;
        }
    }
    set(world, value) {
        this.jar(world).resolve(value);
    }
    get(world) {
        return this.jar(world).promise;
    }
}
// A fundamental world-aware data structure. This wraps a PSet per world where
// it is used. Each world's PSet is updated in-place, imperatively.
class Collection {
    constructor(owner, init) {
        this.owner = owner;
        if (!init) {
            init = PSet.set();
        }
        this.sets = new Map();
        this.sets.set(owner, init);
    }
    // Get the underlying PSet for a given World. If it does not exist yet,
    // create it (as a snapshot of its parent world's set).
    lookup(world) {
        if (this.sets.has(world)) {
            return this.sets.get(world);
        }
        else {
            console.assert(world.parent != null, "collection not defined in any ancestor");
            let parent_set = this.lookup(world.parent);
            this.sets.set(world, parent_set);
            return parent_set;
        }
    }
    // Replace the current set for a given world. The world must have an old
    // set associated with it.
    update(world, set) {
        console.assert(this.sets.has(world), "updating set that does not exist");
        this.sets.set(world, set);
    }
    // If the collection has any updates for this world, merge them into the
    // parent's collection.
    merge(world) {
        if (this.sets.has(world)) {
            let child_set = this.sets.get(world);
            let parent_set = this.lookup(world.parent);
            this.update(world.parent, PSet.merge(parent_set, child_set));
        }
    }
}
// An *external* collection is one where updates affect the world outside of
// OPAL.
class ExternalCollection extends Collection {
    update(world, set) {
        if (world instanceof TopWorld) {
            // Assume for now that the new set is a *descendant* of the old set, so
            // we just need to replay the operations "in between" the old and new
            // sets.
            let old = this.lookup(world);
            let log = set.log(new Set([old]));
            let newset = this.send(old, log);
            super.update(world, newset);
        }
        else {
            super.update(world, set);
        }
    }
}
// The World components concerned with lazy evaluation. This lets worlds
// suspend themselves (voluntarily) and *only* run when demanded to.
class Lazy {
    constructor() {
        this.waiters = 0;
        this.next = null;
        this.finish_jar = new PromiseJar();
    }
    // Load the function to execute. Threads start in a suspended state, so you
    // have to call `acquire` after this to get the thread to actually start
    // executing.
    run(func) {
        this.next = () => {
            let p = func();
            // When the function succeeds, notify anyone who called `finish()`.
            p.then(this.finish_jar.resolve);
            // Handle and log errors in user code.
            p.catch((err) => {
                if (err.stack) {
                    console.error(err.stack);
                }
                else {
                    console.error(err);
                }
            });
        };
    }
    // A promise you can await to know when this function has finished
    // executing.
    finish() {
        return this.finish_jar.promise;
    }
    // Instruct the thread to start executing eagerly.
    acquire() {
        this.waiters++;
        if (this.next) {
            console.assert(this.waiters === 1);
            let next = this.next;
            this.next = null;
            next();
        }
    }
    // Tell the thread that you no longer need it to execute eagerly, balancing
    // an earlier `acquire` call.
    release() {
        this.waiters--;
        console.assert(this.waiters >= 0);
        console.assert(this.next === null);
    }
    // Check whether anyone has called `acquire` but not `release`; i.e., anyone
    // wants us to execute eagerly at the moment.
    active() {
        return this.waiters > 0;
    }
    // Stop executing unless we're in an eager state (i.e., `active()` is true).
    suspend() {
        if (this.active()) {
            // We're active, so just continue executing.
            return Promise.resolve(null);
        }
        else {
            // Inactive, so actually suspend operation by saving the continuation.
            return new Promise((resolve, reject) => {
                this.next = resolve;
            });
        }
    }
}
// A World is a dynamic instance of a hypothetical block. It wraps a coroutine
// with additional state and utilities for managing the world's context.
class World extends Lazy {
    constructor(parent, func) {
        super();
        this.parent = parent;
        this.subworlds = new Set();
        this.collections = new Set();
        this.run(() => func(new Context(this)));
    }
}
// A container for functionality available within the context of a world.
class Context {
    constructor(world) {
        this.world = world;
    }
    // Create a new child world of this one.
    hypothetical(func) {
        let world = new World(this.world, func);
        this.world.subworlds.add(world);
        return world;
    }
    // Create a new weight for communication between this world and a subworld.
    weight() {
        return new Weight(this.world);
    }
    // Set a weight.
    set(weight, value) {
        return __awaiter(this, void 0, Promise, function* () {
            weight.set(this.world, value);
            yield this.world.suspend();
        });
    }
    // Get a weight.
    get(weight, subworld) {
        return __awaiter(this, void 0, Promise, function* () {
            let promise = (function () {
                return __awaiter(this, void 0, Promise, function* () {
                    let result = yield weight.get(subworld);
                    subworld.release();
                    return result;
                });
            })();
            subworld.acquire();
            return yield promise;
        });
    }
    // Create a new collection.
    collection() {
        let c = new Collection(this.world);
        this.world.collections.add(c);
        return c;
    }
    // Add to a collection.
    add(collection, value) {
        let s = PSet.add(collection.lookup(this.world), value);
        collection.update(this.world, s);
        this.world.collections.add(collection);
    }
    // Remove from a collection.
    del(collection, value) {
        let s = PSet.del(collection.lookup(this.world), value);
        collection.update(this.world, s);
        this.world.collections.add(collection);
    }
    // Get the contents of a collection.
    view(collection) {
        return collection.lookup(this.world).view();
    }
    // Commit the collection modifications of a sub-world.
    commit(subworld) {
        return __awaiter(this, void 0, Promise, function* () {
            // Complete executing the world in question.
            subworld.acquire();
            yield subworld.finish();
            // Merge all of its modified Collections.
            for (let coll of subworld.collections) {
                coll.merge(subworld);
            }
        });
    }
    // Explore many hypothetical worlds.
    *explore(domain, func) {
        for (let value of domain) {
            yield this.hypothetical(func(value));
        }
    }
    // Find the world that minimizes a given weight.
    minimize(worlds, weight, limit) {
        return __awaiter(this, void 0, Promise, function* () {
            let count = 0;
            let min_weight = null;
            let min_world = null;
            for (let world of worlds) {
                let w = yield this.get(weight, world);
                if (min_weight === null || w < min_weight) {
                    min_weight = w;
                    min_world = world;
                }
                ++count;
                if (limit && count >= limit) {
                    break;
                }
            }
            return min_world;
        });
    }
}
// The topmost world has no parent and gets a special designation.
class TopWorld extends World {
    constructor(func) {
        super(null, func);
        this.func = func;
    }
}
// A top-level entry point that constructs the initial, top-level world.
function opal(func) {
    let world = new TopWorld(func);
    world.acquire(); // Run to completion.
}
'use strict';
var PSet;
(function (PSet) {
    // A PSet.Node is an immutable, atomic unit in a persistent set structure.
    // Each Node points to its parent (except the root EmptyNode, below). The
    // log of operations on a data structure can be found by tracing the chain of
    // parents.
    class Node {
        constructor(parent) {
            this.parent = parent;
        }
        // Get the flat set of values represented by the data structure.
        view() {
            var out = new Set();
            for (let op of this.log()) {
                op.apply(out);
            }
            return out;
        }
    }
    PSet.Node = Node;
    // An Operation represents an update to the data structure.
    class Operation {
    }
    PSet.Operation = Operation;
    // An operation that adds a value to the set.
    class Add extends Operation {
        constructor(value) {
            super();
            this.value = value;
        }
        apply(set) {
            set.add(this.value);
        }
    }
    PSet.Add = Add;
    // An operation that removes a value from the set.
    class Delete extends Operation {
        constructor(value) {
            super();
            this.value = value;
        }
        apply(set) {
            set.delete(this.value);
        }
    }
    PSet.Delete = Delete;
    // PSets are mostly made up of OperationNodes, which just contain a
    // single Operation.
    class OperationNode extends Node {
        constructor(parent, operation) {
            super(parent);
            this.parent = parent;
            this.operation = operation;
        }
        // The log here is just the parent's log, extended with this node's
        // operation.
        log(until) {
            if (until && until.has(this)) {
                return [];
            }
            return this.parent.log(until).concat(this.operation);
        }
    }
    // An EmptyNode is a root node with no contents.
    class EmptyNode extends Node {
        constructor() {
            super(null);
        }
        log(until) {
            return [];
        }
    }
    // A FlatNode is a root node with a concrete list representing its contents.
    class FlatNode extends Node {
        constructor(contents) {
            super(null);
            this.contents = contents;
        }
        log(until) {
            if (until && until.has(this)) {
                return [];
            }
            let out = [];
            for (let v of this.contents) {
                out.push(new Add(v));
            }
            return out;
        }
    }
    // Given two related sets, find the new operations on `overlay` that need to
    // be applied to `base` to merge them.
    function merge_log(base, overlay) {
        // The first step is to accumulate the *entire* set of ancestors of the
        // base so we can check membership when traversing the overlay's ancestry.
        let base_ancestors = new Set();
        let base_ancestor = base;
        do {
            base_ancestors.add(base_ancestor);
            base_ancestor = base_ancestor.parent;
        } while (base_ancestor !== null && base_ancestor !== base);
        // Next, get the overlay's log *up to but not including* the closest
        // common ancestor.
        let log_suffix = overlay.log(base_ancestors);
        // TODO Check safety: the two nodes need to be related (have some common
        // ancestor). We also need to check for conflicting concurrent operations.
        return log_suffix;
    }
    // The `export`ed functions below are the module's external interface. The
    // interface is uses a functional, immutable style, so to add a value to a
    // set, you do something like this:
    //
    //     let coll1 = ...;
    //     let coll2 = PSet.add(coll1, 42);
    //
    //  rather than mutating the set in place.
    // Given two sets that share a common ancestor, merge the operations
    // that have occurred on either branch and return a new set. It is
    // an error to:
    // - Pass unrelated nodes (i.e., sets with no common ancestor).
    // - Merge two sets with conflicting updates (e.g., where both
    //   branches remove the same item from the set).
    function merge(base, overlay) {
        // Get the operations to replay.
        let log = merge_log(base, overlay);
        // Replay the partial log on top of the base.
        let out = base;
        for (let op of log) {
            out = new OperationNode(out, op);
        }
        return out;
    }
    PSet.merge = merge;
    // Create a new set.
    function set(values) {
        if (values) {
            return new FlatNode(values);
        }
        else {
            return new EmptyNode();
        }
    }
    PSet.set = set;
    // Add a new value to a set.
    function add(coll, value) {
        return new OperationNode(coll, new Add(value));
    }
    PSet.add = add;
    // Remove a value from a set.
    function del(coll, value) {
        return new OperationNode(coll, new Delete(value));
    }
    PSet.del = del;
})(PSet || (PSet = {}));
/// <reference path="opal.ts" />
/// <reference path="pset.ts" />
'use strict';
let outlook = require("node-outlook");
let fs = require("fs");
let path = require("path");
var Calendar;
(function (Calendar_1) {
    function getUserHome() {
        return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    }
    function getSomeEvents(cbk) {
        let home = getUserHome();
        let email = fs.readFileSync(path.join(home, ".opal.email.txt"));
        let token = fs.readFileSync(path.join(home, ".opal.token.txt"));
        let queryParams = {
            '$select': 'Subject,Start,end',
            '$orderby': 'Start/DateTime desc',
            '$top': 10
        };
        // Set the API endpoint to use the v2.0 endpoint
        outlook.base.setApiEndpoint('https://outlook.office.com/api/v2.0');
        // Set the anchor mailbox to the user's SMTP address
        outlook.base.setAnchorMailbox(email);
        outlook.base.setPreferredTimeZone('Pacific Standard Time');
        outlook.calendar.getEvents({ token: token, odataParams: queryParams }, cbk);
    }
    class Event {
        constructor(subject, start, end) {
            this.subject = subject;
            this.start = start;
            this.end = end;
        }
        ;
    }
    Calendar_1.Event = Event;
    function array_remove(a, x) {
        let i = a.indexOf(x);
        if (i !== -1) {
            a.splice(i, 1);
        }
    }
    // A Calendar looks like a collection of events.
    class Calendar extends ExternalCollection {
        send(old, ops) {
            let events = Array.from(old.view());
            for (let op of ops) {
                if (op instanceof PSet.Add) {
                    console.log("TODO: add", op.value);
                    events.push(op.value);
                }
                else if (op instanceof PSet.Delete) {
                    console.log("TODO: delete", op.value);
                    array_remove(events, op.value);
                }
            }
            return PSet.set(events);
        }
    }
    Calendar_1.Calendar = Calendar;
    function events(ctx) {
        return __awaiter(this, void 0, Promise, function* () {
            return new Promise((resolve, reject) => {
                getSomeEvents(function (error, result) {
                    if (error) {
                        reject(error);
                        return;
                    }
                    let events = [];
                    for (let obj of result.value) {
                        events.push(new Event(obj.Subject, obj.Start.DateTime, obj.End.DateTime));
                    }
                    let coll = new Calendar(ctx.world, PSet.set(events));
                    resolve(coll);
                });
            });
        });
    }
    Calendar_1.events = events;
})(Calendar || (Calendar = {}));
/// <reference path="../src/opal.ts" />
/// <reference path="../src/calendar.ts" />
'use strict';
findopenslot(function (ctx) {
    return __awaiter(this, void 0, Promise, function* () {
        // Experimenting with the calendar API.
        let events = yield Calendar.events(ctx);
        console.log("calendar events:");
        for (let e of ctx.view(events)) {
            console.log(e.subject);
        }
        // Add an event.
        let hyp4 = ctx.hypothetical(function (ctx) {
            return __awaiter(this, void 0, Promise, function* () {
                let e = new Calendar.Event("Exciting Meeting!", "12:00", "1:00");
                ctx.add(events, e);
            });
        });
        yield ctx.commit(hyp4);
        console.log("events now:");
        for (let e of ctx.view(events)) {
            console.log(e.subject);
        }
    });
});
