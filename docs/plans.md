title: Next Steps for OPAL

# Local Properties and Incremental Search

OPAL programs often need to compute the quality (i.e., the *cost* or *fitness*) of hypothetical actions.
I contend that there are two ways to approach these computations:

* *Global* or *post facto* cost: Make a change to the world and then, more or less ignoring what changed, evaluate the quality of the hypothetical world.
* *Local* or *incremental* or maybe *ante facto* cost: A score based directly on the proposed change.

So far, OPAL makes the first option, global cost computation, easy; without OPAL's concept of hypotheticals, local costs are clearly easier to compute.

This extension proposes to add a concept that captures the second category of cost computation.
At the same time, it will address how to make scoring in OPAL *incremental:* that is, how to make small changes to search criteria cheaper than starting from scratch.

## Scores as Functions of Diffs

- Introduce a `diff` operation.
- Need some way to support global properties in the same way?

# Loose Ends

## Local and Global Search

We need to think about expressing more sophisticated search algorithms.

## "Bring Me a Rock" Interaction

An important goal of the project is to work without a completely-defined fitness function. How can we build up information about the user's preferences based on incremental information and examples?
