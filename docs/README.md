To build the paper, you'll need [LaTeX][texlive], of course, but also [Madoko][]:

* First, to use Madoko, you need [Node][] (a JavaScript runtime). Head to the [Node homepage][node] and download whichever installer (I don't think the version matters).
* Once Node is installed, install Madoko by typing the command `npm install -g madoko`. (`npm` is the package manager for Node.)

Now you can build the paper by typing `make` in this `docs` directory. You can also use `make view` to also open the resulting PDF, `pdf/opal.pdf`, for viewing.

Madoko can also output HTML if you're into that; just type `make html` or `make view-html`.

[madoko]: https://www.madoko.net/
[texlive]: https://www.tug.org/texlive/
[node]: https://nodejs.org/
