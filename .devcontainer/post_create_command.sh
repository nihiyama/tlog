#!/usr/bin/env bash

set -Eeou pipefail

# update apt
sudo apt update

# install task
npm install -g @go-task/cli
task --completion bash | sudo tee /etc/bash_completion.d/task

# install codex
npm install -g @openai/codex
