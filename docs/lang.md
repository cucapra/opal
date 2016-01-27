title: OPAL Language

[TITLE]

This document explains the OPAL language and APIs. They are currently implemented as a prototype embedded in [TypeScript][].

[TypeScript]: http://www.typescriptlang.org/

# Entry and the Context

An OPAL program is a TypeScript program.
To use OPAL, wrap your code in a top-level call to the `opal` entry-point function:

    opal(function* (ctx) {
      // Your code here...
    });

Your code appears inside an [ES6 generator function][generator] that gets a context object as an argument.
To invoke OPAL's magic, you'll typically make calls through the context and that need to emit values from the generator.
So OPAL-specific operations will usually look like `yield ctx.something_or_other()`.

[generator]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*

# Hypothetical Worlds

# Weights

# Collections and Committing

# External Collections
