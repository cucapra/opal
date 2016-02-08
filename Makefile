SRCDIR := src
DOCSDIR := docs
OUT_JS := opal.js

.PHONY: all
all: $(OUT_JS)

.PHONY: clean
clean:
	rm -rf $(OUT_JS) node_modules typings


# Compile the JavaScript.

TSC := node_modules/typescript/bin/tsc
NODE_D := typings/node/node.d.ts

SRC_FILES := $(wildcard $(SRCDIR)/*.ts)
TS_SRCS := $(SRC_FILES) $(NODE_D)
$(OUT_JS): $(TSC) $(TS_SRCS)
	$(TSC)


# Typings from tsd.

TSD := node_modules/tsd/build/cli.js

%.d.ts: $(TSD)
	$(TSD) install $(lastword $(subst /, ,$*))
	@touch $@


# Tools from npm.

$(TSC): node_modules/typescript/package.json
$(TSD): node_modules/tsd/package.json

node_modules/%/package.json:
	npm install $*
	@touch $@


# Tests.

TAPE := node_modules/tape/package.json
TAPE_D := typings/tape/tape.d.ts
FAUCET := node_modules/.bin/faucet
$(FAUCET): node_modules/faucet/package.json

TEST_SRC := $(wildcard test/*.ts)

test.js: $(TSC) $(NODE_D) $(TAPE) $(TAPE_D) $(TEST_SRC) $(SRC_FILES) test/tsconfig.json
	$(TSC) -p test

.PHONY: test
test: test.js $(FAUCET)
	node $< | $(FAUCET)

# Documentation.

MADOKO := node_modules/.bin/madoko
$(MADOKO): node_modules/madoko/package.json

.PHONY: docs
DOCS_SRC := $(wildcard $(DOCSDIR)/*.md)
DOCS_NAMES := $(notdir $(basename $(DOCS_SRC)))
docs: $(DOCS_NAMES:%=$(DOCSDIR)/build/%.html)

$(DOCSDIR)/build/%.html: docs/%.md $(MADOKO)
	$(MADOKO) --odir=docs/build $<


# Deploy docs to Web server.

.PHONY: deploy
RSYNCARGS := --compress --recursive --checksum --delete -e ssh
DEST := dh:domains/adriansampson.net/opal
deploy: docs
	rsync $(RSYNCARGS) docs/build/ $(DEST)


# Auto-build using https://facebook.github.io/watchman/

.PHONY: watch
watch:
	watchman-make --settle 0.1 \
		-p 'src/**/*.ts' -t all \
		-p 'docs/**/*.md' -t docs
