#!/bin/bash

SCRIPT_DIR=$(readlink -f $(dirname $0))
BUILD_DIR=${SCRIPT_DIR?}/../addons/gstreamer

# Change this to set the Linux distribution and version
DISTRIB_IMAGE=ubuntu
DISTRIB_RELEASE=24.04

BASE_IMAGE=${DISTRIB_IMAGE}:${DISTRIB_RELEASE}

IMAGE_TAG=gstreamer:latest-${DISTRIB_IMAGE}${DISTRIB_RELEASE}

(cd ${BUILD_DIR?} && docker build --cache-from ${IMAGE_TAG?} --build-arg=BASE_IMAGE=${BASE_IMAGE?} -t ${IMAGE_TAG?} .)

(
    cd ${SCRIPT_DIR?}/..
    for image in dist web test; do
        GSTREAMER_BASE_IMAGE=gstreamer GSTREAMER_BASE_IMAGE_RELEASE=latest TEST_IMAGE=selkies-example:${IMAGE_TAG//*:/} DISTRIB_IMAGE=${DISTRIB_IMAGE} DISTRIB_RELEASE=${DISTRIB_RELEASE} docker-compose build ${image}
    done
)