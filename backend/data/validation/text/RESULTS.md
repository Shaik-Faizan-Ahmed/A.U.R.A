# AURA text-detector accuracy validation results

Run against `data/validation/text/samples.jsonl` (36 labeled samples: 18 human-written-style, 18 AI-generated, balanced across 12 topics; 24 English, 6 Spanish, 6 French) using the real `analyze_text()` detector at `config.FLAG_THRESHOLD = 0.6`.

## Overall

| Metric | Value |
|---|---|
| Samples | 36 |
| Accuracy | 0.611 |
| Precision | 1.000 |
| Recall (TPR) | 0.222 |
| False positive rate | 0.000 |
| False negative rate | 0.778 |
| F1 | 0.364 |
| ROC-AUC | 0.923 |
| Confusion matrix | TP=4 FP=0 TN=18 FN=14 |

## By written language (proxy group for the ESL calibration)

| Language | N | Accuracy | FPR | FNR | AUC |
|---|---|---|---|---|---|
| en | 24 | 0.667 | 0.000 | 0.667 | 1.000 |
| es | 6 | 0.500 | 0.000 | 1.000 | 0.556 |
| fr | 6 | 0.500 | 0.000 | 1.000 | 0.000 |

## Calibration diagnostics

- ESL threshold calibration (`calibration_applied=True`) fired on 12/36 samples.
- `langdetect` vs. our own `written_language` label disagreed on 0/36 samples.

**Reading this**: the ESL multiplier in `text_detector.py` is keyed off `langdetect`'s guess of the *submission's own language*, not the writer's native-language background. That only matters here if the es/fr samples show `calibration_applied=True` while the en samples don't -- if so, the mechanism works as coded, but note that it only protects submissions actually written in another language. Real ERP submissions are overwhelmingly written in English regardless of the student's background (an ESL student writing an English-language essay), so this safeguard may see near-zero real-world activation even though it tests correctly here -- worth flagging as a design gap, not just a bug, if the numbers bear it out.

## Per-sample results

See `results.csv` in this folder for the full per-sample breakdown (score, predicted label, detected language, calibration flag).
