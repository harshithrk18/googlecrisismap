// Copyright 2013 Google Inc.  All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License.  You may obtain a copy
// of the License at: http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distrib-
// uted under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
// OR CONDITIONS OF ANY KIND, either express or implied.  See the License for
// specific language governing permissions and limitations under the License.

// Author: kpy@google.com (Ka-Ping Yee)

goog.require('cm.Html');
goog.require('goog.module');

function InitializeTest() {
  cm.TestBase.call(this);
}
InitializeTest.prototype = new cm.TestBase();
registerTestSuite(InitializeTest);

/** Verifies our customizations to the HTML sanitizer. */
InitializeTest.prototype.htmlSanitizer = function() {
  // setForTest_ ensures that cm.Html.sanitize_ is restored after the test.
  this.setForTest_('cm.Html.sanitize_', null);
  installHtmlSanitizer(html);  // sets cm.Html.sanitize_

  // <script> tags and javascript URLs should be removed.  This is not a
  // complete test of the sanitizer, since it's already a tested component;
  // this is just a basic test to ensure that the sanitizer is being invoked.
  expectEq('<div>helloworld</div>',
           cm.Html.sanitize_('<div onclick="javascript:alert(1)">hello' +
                             '<script>alert(2)</script>world</div>'));

  // TODO(romano): The html_css_sanitizer library properly leaves in
  // style attributes and sanitizes the CSS when running in a browser,
  // but incorrectly strips out style attributes when run outside the
  // browser. This should have been fixed by cr/51556988, but is still
  // not working. Once working, the below check can be uncommented. (b/9413480).
  // style attributes should be preserved.
  // expectEq('<div style="color: red">foo</div>',
  //          cm.Html.sanitize_('<div style="color: red">foo</div>'));

  // Ordinary links should be preserved.
  expectEq('<a href="http://x.y/">z</a>',
           cm.Html.sanitize_('<a href="http://x.y/">z</a>'));

  // target="_blank" should be preserved, but not other values of target.
  expectEq('<a href="http://x.y/" target="_blank">z</a>',
           cm.Html.sanitize_('<a href="http://x.y/" target="_blank">z</a>'));
  expectEq('<a href="http://x.y/">z</a>',
           cm.Html.sanitize_('<a href="http://x.y/" target="_top">z</a>'));
};

function MapTest() {
  cm.TestBase.call(this);
  var html = {'sanitizeWithPolicy': function() {}};
  goog.module.provide('sanitizer', 'html', html);
  this.frame_ = new FakeElement('div');

  // Used by the AboutPopup.
  this.setForTest_('goog.dom.htmlToDocumentFragment', createMockFunction());
  stub(goog.dom.htmlToDocumentFragment)(_).is(new FakeElement('fragment'));
}
MapTest.prototype = new cm.TestBase();
registerTestSuite(MapTest);

/** Test the Map constructor with no configuration object. */
MapTest.prototype.testConstruction = function() {
  new cm.Map(this.frame_);
};

/** Test construction with the tabbed UI */
MapTest.prototype.testTabbed = function() {
  var config = {
    'use_tab_panel': true
  };
  new cm.Map(this.frame_, config);

  // Panel is a child of the frame.
  expectThat(this.frame_, withClass('cm-tabbed'));
  var panel = findDescendantOf(this.frame_, withClass('cm-tab-panel'));
  var parent = panel.parentNode;
  expectThat(parent, stringEquals(this.frame_));
};

/** Test construction with the tabbed UI in narrow frame. */
MapTest.prototype.testTabbedBelow = function() {
  this.frame_.offsetWidth = MIN_DOCUMENT_WIDTH_FOR_SIDEBAR - 1;
  var config = {
    'use_tab_panel': true
  };
  map = new cm.Map(this.frame_, config);

  // Panel is a child of the map wrapper.
  var panel = findDescendantOf(this.frame_, withClass('cm-tab-panel'));
  expectThat(panel, withClass('cm-tab-panel-below'));
  var parent = panel.parentNode;
  expectThat(parent, withClass('cm-map-wrapper'));

  // Panel follows the footer.
  var footer = findDescendantOf(this.frame_, withClass('cm-footer'));
  expectThat(panel, stringEquals(footer.nextSibling));
};

/** Test construction with the tabbed panel collapsed. */
MapTest.prototype.testTabbedCollapsed = function() {
  this.setForTest_('window', {
    setTimeout: function() {},
    location: 'http://www.something.com/crisismap/hello?panel_closed=1'
  });
  map = new cm.Map(this.frame_);
  expectNoDescendantOf(this.frame_, withClass('cm-expanded'));
};
