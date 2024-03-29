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
	rm -rf build node_modules docs/build

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

DOCDEPS := $(DOCSDIR)/typescript.json
$(DOCSDIR)/build/%.html: $(DOCSDIR)/%.md $(DOCDEPS)
	cd $(DOCSDIR) ; $(MADOKO) --odir=build $(notdir $<)

.PHONY: docs-watch
docs-watch: docs
	liveserve -w $(DOCSDIR)/ -x 'make docs' $(DOCSDIR)/build/


# Deploy docs and bot.

.PHONY: deploy deploy_docs deploy_bot deploy_paper

RSYNCARGS := --compress --recursive --checksum --delete -e ssh
DEST := dh:domains/adriansampson.net/opal
deploy_docs: docs
	rsync $(RSYNCARGS) docs/build/ $(DEST)

deploy_bot:
	npm install
	cd bot && npm install
	cd bot && npm run build
	systemctl --user restart opal

deploy_paper:
	make -C docs deploy

deploy: deploy_docs deploy_bot deploy_paper
