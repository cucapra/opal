title: Next Steps for OPAL

# Incrementalism

The goal is to work without a fixed fitness function when searching for solutions.
That is, we should propose solutions and ask the user for feedback to refine them.
Computationally, this means we need to efficiently support re-computation when the user makes adjustments.


# Stuff I'm Not Working On Right Now

## Global Search Algorithms

We need to think about expressing more sophisticated search algorithms.

### Monotonic Solution Refinement

Our lazy execution mode with weights doesn't yet support any way to keep producing better solutions.
It can only output a single solution once.
This seems like it will be important in more sophisticated, global search algorithms.

## Computational Cost and User Importance

Eventually, OPAL should have mechanisms for controlling the cost of its work and balancing it with how important the results are for a user.
A notion of importance is also useful independent of cost: it might let OPAL say, for example, that you're just too busy to add yet another new meeting this week.

This has a nifty approximate computing angle:

- Solutions to a query can be "good enough" without being exhaustive.
- Not every query will cost the same to compute with the same quality.
- Not every query will matter as much to the user.

### Real Time and True Parallelism

Along these lines, we probably want the ability to cancel searches when they take too long.
This could use a timeout that says, for example, "update me after 0.2 seconds, and don't run for any longer than 1 second."

## Agent-to-Agent Communication

We need to build an API for multiple OPAL instances to talk to each other.
The interface should probably consist of proposal arguments (i.e., a patch/edit) and score return values.
So you can say, "I'd like to schedule at one of these meeting times. Can you give me your scores for each of them?"
Then you compose those scores with your own to choose a winner.

## Probability Distributions

We've been neglecting the statistical aspect of OPAL that we thought about long ago.
How do probability distributions fit in here?
Sarah had a great simple example with using the weather, even just the probability that it will rain tomorrow.

We think we can probably address all of this by using a top-$k$ kind of representation.
We assume we can get $k$ possibilities from the distribution, each of which is associated with a probability.
For us, that probability should eventually become a weight on a hypothetical world that assumes that value.
