title: Resolving Ambiguity in a Language for Learning-Based Intelligent Systems

# Introduction

Define *intelligent systems* and highlight their importance. This includes conversational UIs, but also...

Describe the problems people have when engineering this kind of systems.

The goal of this work is to address these pitfalls with programming abstractions. We introduce two interlocking concepts that, together, rule out the following classes of potential problems...

This paper describes the design and implementation of OPAL, a programming system for intelligent systems.

# Overview

# Hypothetical Worlds: Ambiguity and Search

In the kinds of intelligent systems we care about, input from the user is often ambiguous.
This makes them different from traditional software engineering, where instructions from the user---button clicks, text commands, and so on---are fully specified.
Instead, intelligent systems need to infer the user's intent by combining evidence from the input and other data.

We introduce *hypothetical worlds*, a concept based on programming task parallel programming models.
Using hypotheticals, programs can explore tentative interpretations of user input without committing to them.
Mutation is isolated in hypothetical worlds so it can be read locally without interfering with concurrent searches.
Multiple levels of hypothetical reasoning let systems search for an interpretation that meets a goal criterion and, only then, commit those changes.

Hypothetical worlds help with these potential pitfalls:

- Ordinarily, you need complicated code to search for and evaluate potential states without actually committing to them. In OPAL, hypothetical code looks exactly the same as code with real effects.
- Incremental re-weighting.
- Atomic interaction with external services.

# Features: Composable and Reusable Learning

Here, the idea is that *features* are an informal concept that everyone ends up reinventing when they create this kind of system.
By adding abstractions for them to the language, we can:

- Add reinforcement learning without interfering with domain-specific logic.
- Separate the tasks of transforming feature data from using it: for example, when personalizing general training for individual users.

# Formalism

Maybe? I'm not 100% sure this paper needs it, but it might be useful to rigorously define the hypothetical semantics.

This section will also include proofs of any interesting properties. Along the way, we should try to think of desirable notions that might be phrased as "guarantees" and therefore useful to formalize.

# Implementation

The implementation section can be short.

# Evaluation

We implement N (probably 3 or 4) case study systems using OPAL.
For each, we qualitatively describe how we used OPAL's abstractions.
Then we measure something quantitative...

# Conclusion
