NAME                     := AWS Quickstarter
DESCRIPTION              := The '$(NAME)' is a is a prototype for an ODS quickstarter

PWD                      := $(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))
GEMS_HOME                ?= $(PWD)/vendor/bundle
INSTALL_REPORT_HOME      := ./reports/install
SHELL                    := /usr/bin/env bash
.SHELLFLAGS              := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS                += --warn-undefined-variables
MAKEFLAGS                += --no-builtin-rules

TF_WORKSPACE             = default

# tfenv hack
DEBUG                    := 0


.PHONY: default
default: test

.PHONY: all
all: test plan deploy deployment-test describe

.PHONY: init
# Initialize project.
init: install-dev-deps install-test-deps

.PHONY: create-tfvars
# create terraform.tfvars.json
create-tfvars:
	terraform-docs json . | jq '.inputs | map({ (.name): .default }) | add' > terraform.tfvars.json

.PHONY: prep-test
prep-test:
	pre-commit run terraformcreatei2o -a
	pre-commit run terraformstackmoduleoutputs -a

.PHONY: test
# Run (pre-deployment) tests.
test: install-test-deps
	$(call check_defined,AWS_ACCESS_KEY_ID)
	$(call check_defined,AWS_SECRET_ACCESS_KEY)
	$(call check_defined,AWS_DEFAULT_REGION)

	# output aws account and user id for testing
	aws sts  get-caller-identity --output text | tee $(INSTALL_REPORT_HOME)/aws_testing_account.log

	# Remove any previously created Terraform test artefacts.
	for dir in .terraform terraform.tfstate.d; do \
		find test/fixtures -name $$dir -print0 | xargs -0 rm -rf; \
	done \

	inspec_profiles=$$(ls -1 ./test/integration); \
	for fdir in $$inspec_profiles; do \
		mkdir -p test/integration/$$fdir/files ; \
		./.venv/bin/python3 ./.venv/bin/hcl2tojson test/fixtures/$$fdir/main.tf  test/integration/$$fdir/files/main.json; \
	done \

	# See https://github.com/test-kitchen/test-kitchen/issues/1436 for why a simple `bundle exec kitchen test` is not an option.
	for suite in $$(bundle exec kitchen list --bare); do \
		bundle exec kitchen verify $$suite || { bundle exec kitchen destroy $$suite; exit 1; }; \
		bundle exec kitchen destroy $$suite; \
	done

.PHONY: plan
# Plan infrastructure deployment.
plan: init-terraform
	$(call check_defined,AWS_ACCESS_KEY_ID)
	$(call check_defined,AWS_SECRET_ACCESS_KEY)
	$(call check_defined,AWS_DEFAULT_REGION)

	TF_IN_AUTOMATION=1 TF_WORKSPACE="$(TF_WORKSPACE)" terraform plan -input=false -out=tfplan

.PHONY: deploy
# Deploy infrastructure.
deploy: init-terraform plan
	$(call check_defined,AWS_ACCESS_KEY_ID)
	$(call check_defined,AWS_SECRET_ACCESS_KEY)
	$(call check_defined,AWS_DEFAULT_REGION)

	# output aws account and user id for testing
	aws sts  get-caller-identity --output text | tee $(INSTALL_REPORT_HOME)/aws_deploy_account.log

	TF_IN_AUTOMATION=1 TF_WORKSPACE="$(TF_WORKSPACE)" terraform apply -auto-approve -input=false -no-color tfplan | tee "$(INSTALL_REPORT_HOME)/tf_apply.log"
	@TF_IN_AUTOMATION=1 TF_WORKSPACE="$(TF_WORKSPACE)" terraform show -no-color -json | tee "$(INSTALL_REPORT_HOME)/tf_show.log" 1>/dev/null

.PHONY: deployment-test
# Run (post-deployment) tests.
deployment-test: install-test-deps
	$(call check_defined,AWS_ACCESS_KEY_ID)
	$(call check_defined,AWS_SECRET_ACCESS_KEY)
	$(call check_defined,AWS_DEFAULT_REGION)

	sh ./lib/scripts/createstackoutputs2yml.sh
	inspec_profiles=$$(ls -1 ./test/integration); \
	for profile in $$inspec_profiles; do \
		JSON_VARS_FILE="$(PWD)/terraform.tfvars.json" bundle exec cinc-auditor exec ./test/integration/$$profile --no-create-lockfile --no-distinct-exit --input-file ./test/integration/$$profile/files/inputs-from-tfo-stack.yml --reporter=cli junit2:build/test-results/test/$$profile.xml json:reports/install/data/inspec/post-install/$$profile.json --target aws://; \
	done

.PHONY: install-report
install-report:
	awk '/Creation complete/  && !/terraform-data/ {print}' "$(INSTALL_REPORT_HOME)/tf_apply.log" > $(INSTALL_REPORT_HOME)/tf_created.log

.PHONY: describe
# Describe infrastructure.
describe: init-terraform
	TF_IN_AUTOMATION=1 TF_WORKSPACE="$(TF_WORKSPACE)" terraform output -json | tee outputs.json

.PHONY: destroy
# Destroy infrastructure.
destroy: init-terraform
	$(call check_defined,AWS_ACCESS_KEY_ID)
	$(call check_defined,AWS_SECRET_ACCESS_KEY)
	$(call check_defined,AWS_DEFAULT_REGION)

	TF_IN_AUTOMATION=1 TF_WORKSPACE="$(TF_WORKSPACE)" terraform destroy -auto-approve

.PHONY: install-dev-deps
# Install development dependencies.
install-dev-deps: install-git-pre-commit-hooks

.PHONY: install-git-pre-commit-hooks
# Install Git pre-commit hooks.
install-git-pre-commit-hooks:
	pre-commit install --overwrite

.PHONY: install-ruby-gems
# Install Ruby gems specified in Gemfile.
install-ruby-gems:
	BUNDLE_SILENCE_ROOT_WARNING=true bundle config --local path $(GEMS_HOME)
	# see https://github.com/rubygems/rubygems/issues/4466 to get rid of error messages in Jenkins
	BUNDLE_SILENCE_ROOT_WARNING=true TMPDIR=./vendor/tmp bundle install --jobs=8

.PHONY: install-python-env
# Install python virtual environment based on Pipfile
install-python-env:
	CI=true PIPENV_VENV_IN_PROJECT=true pipenv install

.PHONY: init-terraform
# Install Terraform workspace.
init-terraform:
	echo 1 | terraform init -backend=true -force-copy -input=false -backend-config="workspace_key_prefix=$(TF_BACKEND_PREFIX)" -backend-config="key=$(TF_BACKEND_S3KEY)/terraform.tfstate"

.PHONY: install-test-deps
# Install testing dependencies.
install-test-deps: install-ruby-gems install-python-env

.PHONY: cinc-auditor-test
# run cinc-auditor without use of kitchen-terraform and create yaml for mapping terraform outputs to inspec inputs.
cinc-auditor-test:
	sh ./lib/scripts/createstackfixtureoutputs2yml.sh
	bundle exec cinc-auditor exec test/integration/default --no-create-lockfile --no-distinct-exit --input-file ./test/integration/$$profile/files/inputs-from-tfo-stack.yml --target aws://

# Checks if a variable is defined and produces a fatal error if not.
check_defined = \
	$(strip $(foreach 1,$1, \
		$(call __check_defined,$1,$(strip $(value 2)))))
__check_defined = \
	$(if $(value $1),, \
		$(error Undefined $1$(if $2, ($2))$(if $(value @), \
			required by target `$@')))
