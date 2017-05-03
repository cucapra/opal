export class FeatId { tag: string }

export class Numeric {
    form: "n";
    id: FeatId;
    data: number;

    static generator(id: FeatId): (d: number) => Numeric {
        return (data) => {
            let f = new Numeric();
            f.form = "n";
            f.id = id;
            f.data = data;
            return f;
        };
    }
}

export class Bounded<T> {
    form: "b";
    id: FeatId;
    dict: T[];
    data: T;

    static generator<T>(id: FeatId): (d: T, dict: T[]) => Bounded<T> {
        return (data, dict) => {
            let f = new Bounded<T>();
            f.form = "b";
            f.id = id;
            f.dict = dict;
            f.data = data;
            return f;
        };
    }
}

export class Unbounded<T> {
    form: "u";
    id: FeatId;
    data: T;

    static generator<T>(id: FeatId): (d: T) => Unbounded<T> {
        return (data) => {
            let f = new Unbounded<T>();
            f.form = "u";
            f.id = id;
            f.data = data;
            return f;
        };
    }
}

export class Packed {
    form: "p";
    id: FeatId;
    data: number[];

    static generator<T>(id: FeatId): (d: number[]) => Packed {
        return (data) => {
            let f = new Packed();
            f.form = "p";
            f.id = id;
            f.data = data;
            return f;
        };
    }
}

export type Feature = Numeric | Bounded<any> | Unbounded<any> | Packed;

export function matchFeature<T>(ncase: (n: Numeric) => T,
                         bcase: <U>(b: Bounded<U>) => T,
                         ucase: <U>(u: Unbounded<U>) => T,
                         pcase: (d: Packed) => T)
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

export function matchTwoFeature<T>(ncase: (n1: Numeric, n2: Numeric) => T,
                            bcase: <U>(b1: Bounded<U>, b2: Bounded<U>) => T,
                            ucase: <U>(u1: Unbounded<U>, u2: Unbounded<U>) => T,
                            pcase: (d1: Packed, d2: Packed) => T)
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

export class FeatureVector {
    data: Map<FeatId, Feature>;

    constructor(vs: Feature[]) {
        this.data = new Map();
        for (let f of vs) {
            this.data.set(f.id, f);
        }
    }

    map<T>(fn: (feat: Feature) => T): T[] {
        let res = [];
        for (let feat of this.data.values()) {
            res.push(fn(feat));
        }
        return res;
    }
}
