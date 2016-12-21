import { opal, Context } from '../src/opal';

opal(async function(ctx) {
    let weight = ctx.weight<number>();

    let world = ctx.hypothetical(async function(ctx) {
        await ctx.set(weight, 42);
    });

    console.log(await ctx.get(weight, world));

    await ctx.commit(world);
});
