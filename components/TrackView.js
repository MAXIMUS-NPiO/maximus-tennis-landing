/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useEffect } from "react";
import { track } from "../lib/analytics";

export default function TrackView({ event, params }) {
  const key = JSON.stringify(params || {});
  useEffect(() => {
    track(event, JSON.parse(key));
  }, [event, key]);
  return null;
}
