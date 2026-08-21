# Anchor Lines demo script — 3:00

Use the synthetic samples only. The pace below leaves enough room for cursor
movement and the source highlight to be visible.

| Time | On screen | Narration / action |
| --- | --- | --- |
| 0:00–0:15 | Landing page | “Award letters can mix grants, loans, and work-study in one package. Anchor Lines gives you plain language you can check.” Point to the privacy note and **Try sample letters**. |
| 0:15–0:35 | Cedar Ridge University sample | Click the first synthetic sample. “This path needs no upload and no API key. We start with a deliberately synthetic award letter.” |
| 0:35–1:05 | Cedar Ridge analysis, transcription visible | Hover or tap the Cedar Ridge Presidential Scholarship card. “The card explains this as gift aid, and the matching text is highlighted in the source. Each explanation stays tied to a quote instead of asking you to trust a summary.” Toggle to **Original** briefly, then return to **Transcription**. |
| 1:05–1:25 | Cedar Ridge loan / work-study cards | Activate a loan card, then work-study. “Loans are debt, with a projected four-year total shown separately. Work-study is wages you may earn; it is not money taken off the bill.” |
| 1:25–1:45 | Back on landing page, Juniper Technical Institute sample | Return home. Click **Juniper Technical Institute** to review its synthetic sample. “Different schools use different terms and may leave essential context out.” |
| 1:45–2:15 | Comparison page with Cedar Ridge and Juniper | Open **Compare offers**. “The table separates cost of attendance, gift aid, loans, net price, and projected four-year debt. It does not subtract work-study from the bill.” Point to Juniper's red **cost hidden** cell — “this letter omits the cost entirely” — then to the **period unclear** cost cells on the other two. “Cedar Ridge prints a $42,000 cost but never says whether that is one year or the whole degree. So every net price here reads *not comparable*: rather than guess a basis and hand you a confident wrong number, the table withholds the one figure you came for and tells you which letter to go ask about. Gift aid, loans, and four-year debt still compare, because those lines do state their periods.” |
| 2:15–2:35 | Comparison warnings | Point to the loan and work-study warnings. “The comparison makes the hidden tradeoffs visible: loans are not grants, and work-study is not bill reduction.” |
| 2:35–2:45 | Return to a letter analysis | Hover a card again so the highlighted source interaction is clearly visible. “Every stated dollar has a checkable source connection.” |
| 2:45–3:00 | Juniper analysis, Cost of attendance card | Return to Juniper, activate its **Cost of attendance** card, and keep the visible amber **not stated in letter** badge in frame. “When the source cannot support a claim, the honest answer is ‘not stated in letter.’ Our offline checked-in synthetic snapshot comparison measured **91.2% / 83-of-91** fields and **91.7% / 11-of-12** expected anchors while counting an intentional omission as a failure.” |

End on Juniper's visible amber **not stated in letter** badge and the
**91.2% / 83-of-91** measured offline field accuracy and **91.7% / 11-of-12**
synthetic anchor verification. Do
not imply that the checked-in snapshot result is a live-provider or real-letter
accuracy claim.

## Optional extension — syllabus mode (+0:30)

If time allows after the 3:00 award-letter demo, show the second document domain.
Still synthetic, still no upload or API key.

| Time | On screen | Narration / action |
| --- | --- | --- |
| +0:00–0:10 | Landing page, document-type selector | Return home. Switch the selector from **Award letter** to **Syllabus**. “Anchor Lines reads more than money. The same checkable approach works on a college syllabus.” |
| +0:10–0:25 | Riverton State · BIOL 101 sample | Click the sample syllabus. “It pulls out every important number — grade weights, the grading scale, penalties, credit hours, and key dates — and groups them.” Hover the **Midterm Exam 25%** card so its source line highlights. “Each number stays tied to its exact line in the syllabus.” |
| +0:25–0:30 | Grade-weights note / warnings | Point to the grade-weights total (100% here) and the **Worth checking** panel. “It even checks whether the weights add up, and flags a value it cannot anchor as ‘not stated in syllabus’ — the same honesty rule as the letters.” |

Do not imply syllabus extraction has a measured accuracy figure; the offline
threshold benchmark covers the award letters, and the syllabus fixture is
validated separately by `eval/syllabi.test.ts`.
