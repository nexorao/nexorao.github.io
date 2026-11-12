import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Reveal } from "@/components/marketing/reveal";
import { FAQ_ENTRIES } from "@/data/faq";

export function FaqSection() {
  return (
    <section id="faq" className="nx-container py-20 md:py-28">
      <SectionHeading
        eyebrow="FAQ"
        title="Answers before you ask"
        description="The short version of how credits, providers and keys behave. The long version ships with full documentation."
      />
      <Reveal className="mx-auto mt-10 max-w-2xl">
        <Accordion type="single" collapsible className="glass rounded-xl px-5">
          {FAQ_ENTRIES.map((entry, index) => (
            <AccordionItem
              key={entry.question}
              value={`faq-${index}`}
              className={index === FAQ_ENTRIES.length - 1 ? "border-b-0" : undefined}
            >
              <AccordionTrigger>{entry.question}</AccordionTrigger>
              <AccordionContent>{entry.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}
