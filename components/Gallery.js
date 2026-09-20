import Image from "next/image";

export default function Gallery() {
  return (
    <section className="sectionPad gallerySection">
      <div className="shell">
        <div className="galleryFrame">
          <Image src="/images/contact-reference.jpg" alt="Temporary MAXIMUS visual reference" fill sizes="100vw" style={{objectFit:"cover", objectPosition:"center 28%"}} />
        </div>
      </div>
    </section>
  );
}
