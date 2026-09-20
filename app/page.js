import Header from "../components/Header";
import Hero from "../components/Hero";
import ContactStore from "../components/ContactStore";
import Methodology from "../components/Methodology";
import Partnership from "../components/Partnership";
import Distribution from "../components/Distribution";
import LongMethodology from "../components/LongMethodology";
import Gallery from "../components/Gallery";
import Testimonials from "../components/Testimonials";
import Office from "../components/Office";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ContactStore />
        <Methodology />
        <Partnership />
        <Distribution />
        <LongMethodology />
        <Gallery />
        <section aria-hidden="true" className="reservedSection" />
        <Testimonials />
        <Office />
      </main>
      <Footer />
    </>
  );
}
