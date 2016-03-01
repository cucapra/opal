# Build the library and examples. `npm build` also works.
.PHONY: build
build: setup
	tsc

# Install everything needed to build.
.PHONY: setup
setup:
	npm install

# Run the tests.
.PHONY: test
test:
	npm test

# Remove all built files, including built documentation.
.PHONY: clean
clean:
	rm -rf build node_modules typings docs/build

# Run one of the examples.
.PHONY: run
run:
	node build/examples/schedule.js


# Documentation.

MADOKO := madoko
DOCSDIR := docs

.PHONY: docs
DOCS_SRC := $(wildcard $(DOCSDIR)/*.md)
DOCS_NAMES := $(notdir $(basename $(DOCS_SRC)))
docs: $(DOCS_NAMES:%=$(DOCSDIR)/build/%.html)

$(DOCSDIR)/build/%.html: $(DOCSDIR)/%.md
	$(MADOKO) --odir=$(DOCSDIR)/build $<

.PHONY: docs-watch
docs-watch: docs
	liveserve -w $(DOCSDIR)/ -x 'make docs' $(DOCSDIR)/build/


# Deploy docs to Web server.

.PHONY: deploy
RSYNCARGS := --compress --recursive --checksum --delete -e ssh
DEST := dh:domains/adriansampson.net/opal
deploy: docs
	rsync $(RSYNCARGS) docs/build/ $(DEST)
