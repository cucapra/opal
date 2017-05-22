export class Either<L, R> {
    private constructor(readonly isLeft: boolean,
        private readonly left: L | undefined,
        private readonly right: R | undefined) {
    }
    static left<L, R>(left: L) {
        return new Either<L, R>(true, left, undefined);
    }
    static right<L, R>(right: R) {
        return new Either<L, R>(false, undefined, right);
    }

    static race<L, R>(l: Promise<L>, r: Promise<R>) {
        let left = new Promise<Either<L, R>>((resolve, reject) => {
            l.then((v) => resolve(Either.left<L, R>(v)));
        });
        let right = new Promise<Either<L, R>>((resolve, reject) => {
            r.then((v) => resolve(Either.right<L, R>(v)));
        });
        return Promise.race([left, right]);
    }

    mapLeft<Lp>(f: (left: L) => Lp) {
        if (this.isLeft) {
            return Either.left<Lp, R>(f(this.left as L));
        } else {
            // force cast
            return this as any as Either<Lp, R>;
        }
    }

    mapRight<Rp>(f: (right: R) => Rp) {
        if (this.isLeft) {
            // force cast
            return this as any as Either<L, Rp>;
        } else {
            return Either.right<L, Rp>(f(this.right as R));
        }
    }

    map<Lp, Rp>(fl: (left: L) => Lp, fr: (right: R) => Rp) {
        if (this.isLeft) {
            return Either.left<Lp, Rp>(fl(this.left as L));
        } else {
            return Either.right<Lp, Rp>(fr(this.right as R));
        }
    }

    bind<Lp, Rp>(fl: (left: L) => Either<Lp, Rp>, fr: (right: R) => Either<Lp, Rp>) {
        if (this.isLeft) {
            return fl(this.left as L);
        } else {
            return fr(this.right as R);
        }
    }

    destruct<T>(fl: (left: L) => T, fr: (right: R) => T) {
        if (this.isLeft) {
            return fl(this.left as L);
        } else {
            return fr(this.right as R);
        }
    }

    ifLeft<T>(f: (left: L) => void) {
        if (this.isLeft) {
            f(this.left as L);
        }
    }

    ifRight<T>(f: (right: R) => void) {
        if (!this.isLeft) {
            f(this.right as R);
        }
    }

    do<T>(fl: (left: L) => void, fr: (right: R) => void) {
        if (this.isLeft) {
            fl(this.left as L);
        } else {
            fr(this.right as R);
        }
    }
}
