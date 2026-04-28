#!/bin/bash
# Sync contracts from contracts/ to foundry/src/ for Foundry testing
cp contracts/*.sol foundry/src/
echo "Synced contracts to foundry/src/"
