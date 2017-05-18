/**
 * The form of a feature.
 */
export type FeatureForm = "n" | "b" | "u" | "p";

/**
 * A simple representation of a feature ID.
 */
export class FeatId {
    tag: string;
    form: FeatureForm;

    constructor(tag: string, form: FeatureForm) {
        this.tag = tag;
        this.form = form;
    }
}

/**
 * A Numeric feature ID, containing a generator for features.
 */
export class NumericId extends FeatId {
    gen: (d: number) => Numeric;

    constructor(tag: string) {
        super(tag, "n");
        this.gen = (data: number) => {
            let f = new Numeric();
            f.form = "n";
            f.id = this;
            f.data = data;
            return f;
        };
    }
}

/**
 * A Bounded feature ID, containing a generator for features.
 */
export class BoundedId<T> extends FeatId {
    gen: <T>(d: T) => Bounded<T>;

    constructor(tag: string, dict: T[]) {
        super(tag, "b");
        this.gen = (data: T) => {
            if (dict.indexOf(data) === -1)
                throw new Error("Invalid category.");
            let f = new Bounded();
            f.form = "b";
            f.id = this;
            f.data = data;
            f.dict = dict;
            return f;
        };
    }
}

/**
 * An Unbounded feature ID, containing a generator for features.
 */
export class UnboundedId<T> extends FeatId {
    gen: <T>(d: T) => Unbounded<T>;

    constructor(tag: string) {
        super(tag, "u");
        this.gen = (data: T) => {
            let f = new Unbounded();
            f.form = "u";
            f.id = this;
            f.data = data;
            return f;
        };
    }
}

/**
 * A Packed feature ID, containing a generator for features.
 */
export class PackedId<T> extends FeatId {
    gen: <T>(d: number[]) => Packed<T>;

    constructor(tag: string, lookup: (idx: T) => number) {
        super(tag, "p");
        this.gen = (data: number[]) => {
            let f = new Packed();
            f.form = "p";
            f.id = this;
            f.data = data;
            f.lookup = lookup;
            return f;
        };
    }
}

/**
 * A feature type wrapping a single numeric value.
 */
export class Numeric {
    form: "n";
    id: FeatId;
    data: number;
}

/**
 * A feature type containing a categorical feature from a defined set of
 * possible categories.
 */
export class Bounded<T> {
    form: "b";
    id: FeatId;
    dict: T[];
    data: T;
}

/**
 * A feature representing an arbitrary categorical feature.
 */
export class Unbounded<T> {
    form: "u";
    id: FeatId;
    data: T;
}

/**
 * A complex feature that contains a list of unlabeled numeric features.
 */
export class Packed<T> {
    form: "p";
    id: FeatId;
    data: number[];
    lookup: (idx: T) => number;

    get(idx: T): (number | null) {
        let i = this.lookup(idx);
        if (i < this.data.length) {
            return this.data[i];
        } else {
            return null;
        }
    }
}

/**
 * The type of all features.
 */
export type Feature = Numeric | Bounded<any> | Unbounded<any> | Packed<any>;


/**
 * Pattern match on a feature.
 *
 * @param ncase the `Numeric` branch
 * @param bcase the `Bounded` branch
 * @param ucase the `Unbounded` branch
 * @param pcase the `Packed` branch
 * @returns     a function that takes any feature to a `T`
 */
export function matchFeature<T>(ncase: (n: Numeric) => T,
    bcase: <U>(b: Bounded<U>) => T,
    ucase: <U>(u: Unbounded<U>) => T,
    pcase: <U>(d: Packed<U>) => T)
    : (f: Feature) => T {
    return (f: Feature) => {
        switch (f.form) {
            case "n": return ncase(f);
            case "b": return bcase(f);
            case "u": return ucase(f);
            case "p": return pcase(f);
        }
    };
}

/**
 * Pattern match on two features.
 *
 * @param ncase the `Numeric` branch
 * @param bcase the `Bounded` branch
 * @param ucase the `Unbounded` branch
 * @param pcase the `Packed` branch
 * @returns     a function that takes any pair of features to a `T`
 */
export function matchTwoFeature<T>(ncase: (n1: Numeric, n2: Numeric) => T,
    bcase: <U>(b1: Bounded<U>, b2: Bounded<U>) => T,
    ucase: <U>(u1: Unbounded<U>, u2: Unbounded<U>) => T,
    pcase: <U>(d1: Packed<U>, d2: Packed<U>) => T)
    : (f1: Feature, f2: Feature) => T {
    return (f1: Feature, f2: Feature) => {
        if (f1.id.tag !== f2.id.tag) {
            throw new Error("Feature Mismatch: Incompatible feature IDs.");
        }
        if (f1.form === "n" && f2.form === "n") {
            return ncase(f1, f2);
        } else if (f1.form === "b" && f2.form === "b") {
            return bcase(f1, f2);
        } else if (f1.form === "u" && f2.form === "u") {
            return ucase(f1, f2);
        } else if (f1.form === "p" && f2.form === "p") {
            return pcase(f1, f2);
        } else {
            throw new Error("Feature Mismatch: Forms of " +
                "features are incompatible.");
        }
    };
}

/**
 * The type of a feature vector, optimized for lookup as well as efficient
 * transformation to other representations.
 */
export class FeatureVector {
    data: Map<FeatId, Feature>;

    constructor(vs: Feature[]) {
        this.data = new Map();
        for (let f of vs) {
            this.data.set(f.id, f);
        }
    }

    private get<T extends Feature>(id: FeatId, form: FeatureForm): T {
        if (id.form != form) {
            throw new Error("Expected form \"" +
                form +
                "\" found \"" +
                id.form +
                "\".");
        }
        let f = this.data.get(id);
        if (!f) {
            throw new Error("Cannot find feature with ID (" + id.tag + ").");
        }
        return f as T;
    }

    getN(id: FeatId): Numeric { return this.get<Numeric>(id, "n"); }
    getB<T>(id: FeatId): Bounded<T> { return this.get<Bounded<T>>(id, "b"); }
    getU<T>(id: FeatId): Unbounded<T> { return this.get<Unbounded<T>>(id, "u"); }
    getP<T>(id: FeatId): Packed<T> { return this.get<Packed<T>>(id, "p"); }

    map<T>(fn: (feat: Feature) => T): T[] {
        let res = [];
        for (let feat of this.data.values()) {
            res.push(fn(feat));
        }
        return res;
    }
}
