# Fixture reference sources

The fixtures in this directory (`eval/letters/`, `eval/syllabi/`, `eval/candidates/`) are
fictional. They do not reproduce any source document, institution, person, wording, amounts,
or branding. Their layouts and edge cases were independently designed after reviewing public
educational examples.

For **genuine, real, committed test documents** (not fictional, not part of the offline
benchmark), see `test-documents/SOURCES.md` — real U.S. Dept. of Education public sample
award letters and real university syllabi, kept for live-extraction testing against
real-world formatting.

- [U.S. Department of Education — Sample Aid Offer Letter 2](https://www.ed.gov/sites/ed/files/policy/highered/guid/aid-offer/sample-aid-offer-2.pdf): itemized cost-of-attendance components and offer terms.
- [U.S. Department of Education — Sample Aid Offer Letter 3](https://www.ed.gov/media/document/sample-aid-offer-3pdf-57115.pdf): accept/decline offer workflow and eligibility notices.
- [NASFAA Financial Aid Offer Examples](https://www.nasfaa.org/offer_examples): current model-offer terminology and presentation patterns.
- [University of Chicago Network for College Success examples](https://ncs.uchicago.edu/tool/example-financial-aid-award-letters): grant, loan, and work-study variety.

## External evaluation sources

No public dataset found in this review contains real financial-aid offer documents with reusable, field-level gold labels and unambiguous redistribution rights. Do not treat public examples as ground truth or commit student documents.

- [OHR-Bench](https://huggingface.co/datasets/opendatalab/OHR-Bench) is useful for broad OCR stress testing across finance and other document domains, but is not an award-letter correctness benchmark.
- A production benchmark requires consented, redacted award letters and independently annotated expected values and source spans.
