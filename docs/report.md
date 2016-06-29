OPAL: Optimization and Personal Assistant Language

# Background

- Rise of intelligent systems
  - more personalization, greater scale, new applications (e.g., physical world stuff)
  - Why is this different?
    - Technical debt stuff
    - Complete learning loop
    - No statistical contracts
    - entanglement/abstraction busting
      - Performance - SLA
      - Uncertainty, data bias,  
    - More at stake now
      - infrastructural
      - Mission critical applications 
- These look like systems/pl problems
  - System has to do it
    - Boundary between things
    - Runtime enforcement
  - We can use a lot of our great tools
  - Plus some new ones

Related Text:

We are just beginning to see the initial ripples of the next major wave of computing.  In the beginning, computers were primarily used for computation, and later, they also became powerful communication tools.  The emerging 3rd wave of applications seeks to help us better engage with the world around us. We can see many early examples: augmented reality applications overlay the real world with anything from translations of signs (e.g., WordLens) to virtual modifications of real objects (e.g., HoloLens); digital assistants (e.g.., Siri, Cortana, Google Now) understand physical concepts like locations and traffic and advise users on travel times and directions; and smart devices monitor and automate anything from room temperature (e.g., Nest thermostats) to watering plants (e.g., Parrot Flower Power H2O).

This new wave of applications will be more demanding on our computing systems in nearly every way. Monitoring the current state of the world will necessitate increased bandwidth to collect the sundry set of data streams, and crossing the boundary between physical and digital worlds requires significant computation to do the data processing and inference required to turn analog signals into meaningful digital information.  Understanding the world will likely require joining large amounts of data from diverse sources, rich models and simulations, and complex inferences.  Finally, reacting to and controlling the world will demand rapid response times. Building systems for this class of applications will require both new abstractions and architectures to enable new programing models and provide scalability as well as new control algorithms to operate effectively.  

* The Rise of Intelligent Systems

* Many of these problems are Programing Language Problems

* Challenges of increasing command surface

    * Finding and negotiating functionality

    * Automating repetitive tasks

    * Customization and personalization

As we add functionality to systems, we must address the resulting complexity of the user interface. Already users struggle to control and understand their devices: witness the growing number of help and support pages to guide users through all aspects of life, especially complex software. [Ideally we would code tasks and preferences using constructs that are simple to author and easy to inspect.] Humans naturally deal with ambiguous circumstances and instructions through interaction, and learn what others prefer to quickly navigate these spaces. Future software must have similar abilities: retaining ambiguity as necessary, refining interpretations through interaction, and modeling user preferences based on interactions.

[Talk about the confluence of systems, programming languages, human computer interaction, etc -- does this belong at the end of this section or the beginning of the next?]

[Programming language mediates the user-interaction ambiguity and system interpretation ambiguity

You would think that there’s an in interface component and a systems component. Somewhere in between there are abstractions that stay separate but allow them to communicate. The way that you interact with the user has complicated interactions with how the system works, and the system constraints have ramifications for the user.

Clearly a problem -- between systems and UI -- we can add a language abstraction.

Think in terms of dialog

U: "[initial request]"

S: "Do you mean A, B, or C?"

U: "Well, B is almost right, but [refinement]"

S: "Ah, how about B’?"

U: "Yes, perfect!"

S: Applies transaction, updates weights to prefer B over A

]

# Project Vision

The level of abstraction for mainstream application development is changing. Instead of functions and variables, the basic atoms in a mobile application or voice assistant are entire web services or natural language models.

For "classical" development, engineers have tools and techniques to make software more composable, debuggable, and maintainable. Modern applications that use intelligent systems have similar problems, but they occur at a different level of abstraction. Instead of null pointers and memory leaks, potential problems in intelligent systems include conflated features, training feedback loops, and low-quality classifiers. Instead of command-line interfaces and GUIs, intelligent systems use a new category of user interaction that is prone to ambiguity and confusing output. These new categories of pitfalls and correctness criteria need corresponding modern tools and abstractions.

The goal of this project is to identify the right abstractions that give developers control over the higher-order concerns of intelligent systems. The idea is that the right set of concepts already exist in intelligent systems, but they are latent in the code written using traditional programming languages and traditional tools. Especially as software projects grow, these missing abstractions make it difficult to avoid the pitfalls that come with complex component interactions. With a new approach to programming, we can rule out entire classes of problems that affect intelligent systems and build tools to help catch others---in the same way that type systems rule out low-level programming errors and profilers help catch performance pathologies.

We target these latent concepts in intelligent system engineering:

* Users of machine learning don’t need to worry about the "guts" of ML algorithms. They can specify the “inputs and outputs” instead—the raw ingredients that specify what they *want* out of the learning system.

* Hypothetical worlds: specifying features where the most natural expression is on the state of the current world, even when that world doesn’t exist yet.

* [list here]

* Dealing with ambiguity in user intent [hypothetical worlds]

* Multi-turn interactions [incremental]

* …

By designing these abstractions into the language, we think we can avoid problems like:

* [list again]

[give examples in this paragraph of what could go wrong]

Specifying the score for things that are several levels "deep" into potential changes. For example, if you need to move a meeting to another day, which implies canceling a meeting on that day, and then computing the travel time *excluding* that canceled meeting, suddenly the fitness computations are really complicated.

[an example should include composing]

# High-Level OPAL Design

* Users vs programs vs integrators/service providers

[Adrian: I’d like to come back to this overview section after getting a little more detail into the body sections.]

# Mechanisms in the Language

## Features

A core concept in OPAL is a *feature*, which is a mechanism for scoring and ranking things. The idea is to provide a better abstraction for ranking alternatives to support high-level operations including:

* Learning: a uniform way to update a model’s weights according to user interaction. The main use case here is for reinforcement learning, but you could also imagine using the same abstractions for supervised learning on the same model.

* Personalization: using a common model specification that combines global priors and per-user preferences.

* Explanation: when the system makes a decision, it can use the feature structure to explain why it made that decision.

In programming languages terms, a "feature" is a function from an input type ‘a to a score number.

* BasicFeature

* Weight

* LinearFeature

How to *use* a feature (really, a network of features):

* Applying a features produces a Score

* A Score can be flattened to a single number, and used for ranking

* A Score can also produce explanations

* Reinforcement learning looks like taking a Score and providing the user’s actual decision as a number

How to *define* features:

* How to personalize all the weights in a structure? Are the weights associated with the Feature object (probably not) or provided by an external repository? There’s some missing concept here of a "weight repository" that maps the *identity* of Feature objects to values. We provide a global default.

The idea is that all of this together should let non-ML-expert users apply ML models, train ML models, and extract interesting information---without worrying about the actual learning mechanism.

## Distributions

OPAL includes first-class support for probability distributions. A distribution of type T~ is a weighted set of values of type T. Concretely, a T~ is implemented as a collection of $(v, p)$ pairs of a value and a probability.

In OPAL, code can work with distributions even when it is written in a probability-oblivious way. Any operation that works on a value T is automatically "lifted" to operate on T~ by mapping it over the elements of the distribution. For example, an absolute value function from `Float` to `Float`, when lifted, is a function from `Float~` to `Float~`; lifting applies the `abs` value to each number in the distribution’s support.

OPAL also provides basic built-in tools for working directly with entire distributions. A `max` operation gets the most likely element from a distribution, and a `sample` operation can randomly select values according to the distribution.

[This section bears revisiting once we actually use distributions meaningfully.]

## Hypothetical worlds

In the kind of intelligent applications we want to target, a common goal is to choose the best action to take in the real world among alternatives. The action could be scheduling a meeting, booking a flight, or sending a message. The common thread is that the best alternative depends on how the world *would* look if the action were taken: in other words, the fitness of a potential action depends on its effect on the world. For example, a potential meeting slot might be good if the travel times between adjacent events is sufficient, or it might be bad if it leads to a busy day with too many meetings.

OPAL introduces an abstraction for *hypothetical worlds* to deal with potential actions and their effects on the outside world. The intent is to let the system define the quality of an action *post facto* in terms of its effects. This style of definition can be more natural than defining preferences in terms of the action itself. The style is especially critical when composing multiple, potentially conflicting actions.

(Hypothetical worlds also let systems encapsulate changes for preview and training before committing to them. The next section gives details on that aspect.)

OPAL’s hypothetical worlds borrow concepts from task-parallel programming languages. The program *forks* a new hypothetical world that runs in a snapshot of the state of the current world. The child world can make changes to the state, but the changes do not immediately affect the view of the same data in the parent world. The parent is in charge of deciding when to *commit* the child’s changes and apply any updates to the parent’s state. To decide which uncommitted hypothetical world to commit, the parent uses special-purpose communication channels.

**Post-facto fitness assessment.**

Hypothetical worlds facilitate the definition of search criteria. For example, a meeting scheduler can fork many hypothetical worlds to decide which slot is best for a meeting. In each child world, the system will attempt to schedule a meeting in a different slot. Adding a meeting to the calendar inside a hypothetical world does not send any commands to the real-world calendar server; instead, it affects shadow data that is visible only to the OPAL program itself. It can inspect the potential final state of the calendar to decide the potential action’s quality---for example, it might measure how busy the day has become, or how many meetings have been scheduled before a cut-off time in the morning.

Without the ability to pre-flight potential changes in hypothetical worlds, the programmer would need to define these quality properties in terms of the action itself. They would need to define the "busy day" feature, for example, by manually recreating the final calendar state and measuring it.

**Modular worlds and recursive search.**

Hypothetical worlds also provide an abstraction mechanism. In the scheduling example, a child world that wants to schedule a meeting in a given slot may need to recursively move a pre-existing conflicting meeting. To find the best way to move *that* meeting, the child world can recursively fork second-level child worlds of its own. In other words, OPAL code can use hypothetical worlds anywhere without exposing them to its clients.

## Integrating with real-world services

OPAL is a system integration language: it needs to interface safely with external services that take actions on its behalf. The external systems need to play nicely with OPAL’s internal abstractions: namely, hypothetical worlds.

The idea is that OPAL programs can affect the outside world automatically when they commit hypothetical changes *into the top-level world*. In other words, the top-level non-hypothetical world in OPAL is where service interactions occur, and hypothetical worlds help coordinate those interactions.

**Hypothetical worlds for consistency and atomicity.**

This means that hypothetical worlds also work as a form of concurrency control. As with a transaction, a hypothetical world is isolated from any other code---including external systems---until the program commits it. The data it observes cannot change during the course of the world’s execution. For example, a scheduling program in OPAL can observe that a meeting slot is free and schedule a new meeting in that slot without worrying that someone else will fill that slot in between the check and the update.

**Interface to the outside world.**

Service providers can write OPAL libraries to expose their data inside the OPAL universe. This works by extending OPAL’s collection type with hooks for each possible operation on the collection. Collections support addition and deletion by default, but providers can also add custom operation types---for example, our calendar source supports an in-place modification operation. When hypothetical operations reach the non-hypothetical top-level world, OPAL "unspools" the hypothetical operations and invokes the library’s hooks.

[Adrian: That paragraph is still pretty messy and vague, and it might belong somewhere else.]

# Programing

## Hypothetical worlds

xx

* parent/child paradigm

* Communication

* Edits/diffs

* Implementing optimization/search with these

    * Recursion

    * Examples with search algorithms

## Objective functions, weights, ranking, features

* Feature creation

# Runtime

## Language concurrency 

## Multiturn refinement with computational reuse

## Reinforcement learning

## Controlling computation cost/value

        * Bounding cost/search space

# Calendar Prototype

# Extensions, Future Work, Related Systems

## Learning systems

        * Smarter models, more personalization

        * More intelligent search/learning to search

Initial system implementations can rely on simple models with limited personalization. For instance, each task can have a separate linear model with its own weights. A natural next step is to allow some degree of parameter sharing between users. For instance, each task could have two copies of each parameter: the first would be weighted by a value shared by all users, and the second would have a user-specific weight [cf. [http://www.umiacs.umd.edu/~hal/docs/daume07easyadapt.pdf](http://www.umiacs.umd.edu/~hal/docs/daume07easyadapt.pdf)]. This allows the model to capture general preferences and user-specific exceptions. More complex systems could have multi-level sharing by grouping users into subtypes, parameter sharing across tasks, and more complex models.

The ranking of potential system actions can be naturally cast as either supervised learning or reinforcement learning. If the actions are drawn from a small, finite set, then multi-class classification or multi-armed bandits suffice. However, the actions are likely to become more complex and parameterized. Imagine a calendaring system: initially it might just propose a series of possible calendar slots to a user, but a richer implementation might perform a complex set of rescheduling operations to implement the user’s command. The structure prediction task of learning a complex set of rescheduling operations given a user command is a very interesting research area. Although there is some relevant prior work in both semantic parsing [cite Mooney et al.] and mapping from language to code [cite naturalness of code, lang2code workshop, etc.], lots of work remains.

## Dialog systems

        * Language-integrated "LUIS 2.0"

        * Shared models natural language understanding tasks

Many real-world tasks are difficult to express in a single turn. People, when discussing a course of actions, often require a conversation to understand all the necessary details and ramification of a task. These dialogs negotiate the bounds of a task, circumvent or discard the unachievable portions, disambiguate the core actions, refine the specific details, and confirm the broad goal before committing the task in the end.

A number of recent systems such as LUIS.ai, wit.ai, and api.ai build natural language understanding systems on user utterances using active learning techniques. The learning aspect of these systems generally treats each application or domain as completely independent, and focuses on single-turn interactions, though. Any connections between dialog turns are generally hand-crafted through developer defined contexts.

Longer term, we hope to address some of these issues in two ways. First, we believe that many types of user data should be shared across applications. [] []

## ML-User Interface

        * Explaining decisions

        * Core operations:

            * Ranking

            * Gathering user preferences

Unlike probabilistic programming systems, OPAL provides a high-level interface to the machine learning systems. Our core operations focus on populating and choosing among hypothetical worlds. These worlds are ranked by features with learned weights, so that the ranking of worlds can be learned for each scenario and potentially customized for each user. A crucial initial set of operations include ranking worlds, then gathering user preferences about those rankings to update weights. Longer term, we envision a system that can naturally communicate why some elements are preferred over others. Psychology research has shown that people respond much more positively to requests with explanations [CITE Ellen Langer, 1977]. Also, we begin by learning features that are crafted by the developer. Soliciting new features from the user allows much more flexibility and customization in ranking.

## Agent-to-agent communication

# Appendix: 

    * User Guide

    * Programmer Guide

    * Service Integrator Guide

