#!/usr/bin/python
# Copyright 2012 Google Inc.  All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may not
# use this file except in compliance with the License.  You may obtain a copy
# of the License at: http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software distrib-
# uted under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
# OR CONDITIONS OF ANY KIND, either express or implied.  See the License for
# specific language governing permissions and limitations under the License.

"""Handler for intrinsic properties pipeline update requests from the client.

This module allows the client to retrieve updates regarding intrinsic properties
of relevant layers. Such updates are performed separately by retriever module.
"""

__author__ = 'cimamoglu@google.com (Cihat Imamoglu)'

import base64
import hmac
import logging
import os

import webapp2

import base_handler
import cache
import maproot
import metadata_fetch

ACTIVE_SECONDS = 24 * 3600  # layers stay active for 24 hours after activation
ADDRESS_TTL_SECONDS = 24 * 3600  # keep cached source address lists for a day
SUPPORTED_LAYER_TYPES = [maproot.LayerType.KML, maproot.LayerType.GEORSS]


def GetSourceAddresses(maproot_object):
  """Yields addresses of all the supported sources in the given MapRoot JSON."""
  for layer in maproot.GetAllLayers(maproot_object):
    if layer.get('type') in SUPPORTED_LAYER_TYPES:
      yield maproot.GetSourceAddress(layer)


def CacheSourceAddresses(map_version_key, maproot_object):
  """Caches a map's list of source addresses under an unguessable key.

  The UI periodically hits metadata.py to get updated metadata for all the
  layers in a map.  To save bandwidth, instead of putting all the source
  addresses in every request, we cache the list and have the UI refer to it by
  the cache key, which is derived from the MapVersionModel's db.Key (once
  stored, a MapVersionModel is never modified).  We use HMAC to make the cache
  key unguessable so that metadata.py doesn't expose the contents of all maps.

  Args:
    map_version_key: The MapVersionModel's datastore key.
    maproot_object: The map's MapRoot JSON deserialized to an object.

  Returns:
    The cache key and the list of sources stored at that cache key.
  """
  cache.Add(['source_addresses_key'], base64.urlsafe_b64encode(os.urandom(30)))
  hmac_key = cache.Get(['source_addresses_key'])
  cache_key = hmac.new(hmac_key, str(map_version_key)).hexdigest()
  sources = sorted(set(GetSourceAddresses(maproot_object)))
  cache.Set(['source_addresses', cache_key], sources, ADDRESS_TTL_SECONDS)
  return cache_key, sources


def ActivateSources(sources):
  """Marks the specified sources active and queues fetch tasks as necessary."""
  # To avoid hitting memcache N times for each pageview of an N-layer map, we
  # skip activation if the same set of layers has been activated recently.
  if cache.Add(['metadata_activate', hash(tuple(sources))], 1):
    for address in sources:
      if cache.Add(['metadata_active', address], 1, ttl_seconds=ACTIVE_SECONDS):
        logging.info('Activating layer: ' + address)
        metadata_fetch.ScheduleFetch(address, 0)  # start fetching immediately
      else:  # extend the lifetime of the existing metadata_active flag
        cache.Set(['metadata_active', address], 1, ttl_seconds=ACTIVE_SECONDS)


class Metadata(base_handler.BaseHandler):
  """Retrieves metadata for the specified cache key and source addresses.

  Accepts these query parameters:
    - key: Optional.  A cache key obtained from CacheSourceAddresses.
    - source: Repeatable.  Any number of addresses of additional sources.
    - callback: Optional.  A callback function name.  If provided, the
          returned JSON is wrapped in a JavaScript function call.
  """

  def get(self):  # pylint: disable=g-bad-name
    """Retrieves metadata for the specified cache key and source addresses."""
    cache_key = self.request.get('key')
    sources = cache.Get(['source_addresses', cache_key]) or []
    if sources:  # extend the lifetime of the cache entry
      cache.Set(['source_addresses', cache_key], sources, ADDRESS_TTL_SECONDS)
    sources += self.request.get_all('source')
    self.WriteJson(dict((s, cache.Get(['metadata', s])) for s in sources))
    ActivateSources(sources)

app = webapp2.WSGIApplication([(r'.*', Metadata)])
