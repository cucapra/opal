import { EventEmitter } from "events";

/**
 * Create a JavaScript ordering function given a function that looks up an
 * element's key. For example, use:
 *
 *     array.sort(orderBy((o) => o.f));
 *
 * to sort by an object's `f` field.
 */
export function orderBy<S, T>(f: (v: S) => T) {
    return (a: S, b: S) => {
        let aKey = f(a);
        let bKey = f(b);
        if (aKey < bKey) {
            return -1;
        } else if (aKey > bKey) {
            return 1;
        } else {
            return 0;
        }
    };
}


/**
 * Dynamic null check for TypeScript 2.0. (A dynamic version of the new
 * built-in ! operator.)
 */
export function nchk<T>(x: T | null, msg?: string): T {
    if (x === null) {
        throw msg || "null check failed";
    }
    return x;
}

/**
 * Handle events emitted using callback APIs by converting them to promises.
 * Not actually typesafe, but this gives us a decent wrapper abstraction around it
 *  so that if we squint a bit we can pretend that it is.
 */
export function eventToPromise<T>(emitter: EventEmitter, ...events: string[]): Promise<[string, T]> {
    let res = new Promise<[string, T]>((resolve, reject) => {
        let handlerMap: { [eventName: string]: Function } = {};
        for (let event of events) {
            let handler = (...args: any[]) => {
                for (let other of events) {
                    emitter.removeListener(other, handlerMap[other]);
                }
                // hack to cast to a T
                resolve([event, <T>(args as any[] | T)]);
            };
            emitter.on(event, handler);
            handlerMap[event] = handler;
        }
    });
    return res;
}
