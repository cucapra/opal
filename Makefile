SRCDIR := src
SOURCES := opal.ts
TSCARGS := --noImplicitAny

SRC_FILES := $(SOURCES:%=$(SRCDIR)/%)
OUT_JS := opal.js

.PHONY: all
all: $(OUT_JS)

.PHONY: clean
clean:
	rm -rf $(OUT_JS) node_modules typings


# Tools from npm.

TSC := node_modules/typescript/bin/tsc
TSD := node_modules/tsd/build/cli.js

$(TSC): node_modules/typescript/package.json
$(TSD): node_modules/tsd/package.json

node_modules/%/package.json:
	npm install $*
	@touch $@


# Typings from tsd.

NODE_D := typings/node/node.d.ts

typings/%.d.ts: $(TSD)
	$(TSD) install $(firstword $(subst /, ,$*))
	@touch $@


# Compile the JavaScript.

TS_SRCS := $(SRC_FILES) $(NODE_D)
$(OUT_JS): $(TSC) $(TS_SRCS)
	$(TSC) $(TSCARGS) --out $@ $(TS_SRCS)

parser.js: $(SRCDIR)/grammar.pegjs $(PEGJS)
	$(PEGJS) --cache < $(<) > $@


# Auto-build using https://facebook.github.io/watchman/

.PHONY: watch
watch:
	watchman-make --settle 0.1 \
		-p 'src/**/*.ts' -t all
