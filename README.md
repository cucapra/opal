OPAL
====

This is a repository for experimenting with an implementation of our language for coordinating learning systems for assistant tasks.

The Markdown documents in the `docs/` directory are rendered with [Madoko][] and published on every push to [a directory on Adrian's server][docs].

[madoko]: https://www.madoko.net
[docs]: http://adriansampson.net/opal/


Building
--------

### Command Line

Provided you have Node.js and npm:

* Install the dependencies: `npm install`
* Install the type definitinos: `npm run typings`
* Build the examples: `npm build`
* Run one of the examples: `node build/examples/schedule.js`

### Visual Studio

You can build OPAL using Visual Studio 2015.
You will need both its [Node.js Tools][njstools] and an *independent* installation of the latest official Node.js, which you can get from [nodejs.org][njs].
Here's how:

* Open the solution file.
* Right-click the `npm` item under the `opal` project and choose "Install Missing npm Packages." This gets the project's dependencies.
* This step is a little annoying at the moment, but we need to install the TypeScript definitions for those dependencies. Right-click the `opal` project and choose "Open Command Prompt Here." Then type the command `npm run typings`. You can close the command prompt.
* Hit F5 to build and run the example program. Ignore the scary warning that Visual Studio for some reason emits.

[njstools]: https://www.visualstudio.com/en-us/features/node-js-vs.aspx
[njs]: https://nodejs.org/

### Visual Studio Code

[Visual Studio Code][vscode] has great IDE support for TypeScript, but the build system is kind of broken. So you're probably best off using the command-line route to build and run the project.

[vscode]: https://code.visualstudio.com/
