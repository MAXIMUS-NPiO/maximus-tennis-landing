/** Language negotiation: the device language selects a locale, a named language is never overridden. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pick } from "../lib/language.js";

test("device language selects the locale, honouring q values", () => {
  assert.equal(pick(null), "en");
  assert.equal(pick(""), "en");
  assert.equal(pick("ru-RU,ru;q=0.9,en;q=0.8"), "ru");
  assert.equal(pick("zh-CN,zh;q=0.9"), "zh");
  assert.equal(pick("zh-Hans-CN"), "zh");
  assert.equal(pick("en-GB,en;q=0.9"), "en");
  assert.equal(pick("be-BY,be;q=0.9"), "ru");
  // The highest q wins even when it is not first in the header.
  assert.equal(pick("en;q=0.2,ru;q=0.9"), "ru");
  // An unknown language falls back to the default rather than to nothing.
  assert.equal(pick("sw-KE,sw"), "en");
  assert.equal(pick("*"), "en");
});
