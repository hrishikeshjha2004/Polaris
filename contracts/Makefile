ROOT := $(shell git -C "$(dir $(abspath $(lastword $(MAKEFILE_LIST))))" rev-parse --show-toplevel)

.PHONY: build test fmt lint deploy clean

build:
	cd $(ROOT) && cargo build --target wasm32-unknown-unknown --release

test:
	cd $(ROOT) && cargo test

fmt:
	cd $(ROOT) && cargo fmt --all

lint:
	cd $(ROOT) && cargo clippy -- -D warnings

deploy:
	cd $(ROOT) && stellar contract deploy \
		--wasm target/wasm32-unknown-unknown/release/*.wasm \
		--source $(STELLAR_SECRET_KEY) \
		--network testnet

clean:
	cd $(ROOT) && cargo clean
