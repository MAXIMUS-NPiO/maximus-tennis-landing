/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { AUTHOR, copyrightYears, notice, rightsUrl, permissionUrl } from "../lib/authorship";

/**
 * The authorship line under every calculation the site performs — the Family Tennis Plan, the
 * configurator and the GPS selection. The model, its method and the algorithms behind it are the
 * author's work, and the result a visitor reads carries his name with it.
 */
export function ModelRights({ dict }) {
  const text = (dict?.rights?.model || "").replace("{years}", copyrightYears());
  if (!text) return null;
  return <p className="model-rights" data-authorship="model">{text}</p>;
}

/**
 * Image rights as schema.org microdata inside the frame of a photograph: creator, copyright
 * holder, credit, notice, licence and where to ask for permission. Search engines read it from the
 * page (it is what shows a picture as rights-reserved in image search); nothing of it is visible.
 * <meta> and <link> with itemProp stay where they are rendered (React does not hoist them).
 */
export function RightsMeta() {
  return (
    <>
      <span hidden itemProp="creator" itemScope itemType="https://schema.org/Person"><meta itemProp="name" content={AUTHOR} /></span>
      <span hidden itemProp="copyrightHolder" itemScope itemType="https://schema.org/Person"><meta itemProp="name" content={AUTHOR} /></span>
      <meta itemProp="creditText" content={AUTHOR} />
      <meta itemProp="copyrightNotice" content={notice()} />
      <link itemProp="license" href={rightsUrl("en")} />
      <link itemProp="acquireLicensePage" href={permissionUrl("en")} />
    </>
  );
}

/** The attributes that make an element the ImageObject the microdata above belongs to. */
export const imageObject = { itemScope: true, itemType: "https://schema.org/ImageObject" };
