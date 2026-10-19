# Health Auto Export fixtures

**All `provisional-*.json` files are hand-written from the Health Auto Export documentation**, not
captured from a real device. Replace/extend them with a real anonymized export when available
(see the TODO in `../map-workout.test.ts`). Field names vary between HAE export versions, which is
why every mapping detail lives in `mapWorkout()`.

| File | Covers |
|---|---|
| `provisional-v2-outdoor-run.json` | Current format: `{qty, units}` objects, `"yyyy-MM-dd HH:mm:ss +ZZZZ"` dates, HR samples, route |
| `provisional-v2-mixed.json` | A run, an indoor run (no route), a walk and a cycle ride (skipped), a broken run (invalid) |
| `real-v2-es.json` | **Real export** from a Spanish iPhone (anonymized: device names removed, route moved to central Madrid, every series cut to 4 points): a strength workout, "Exterior Ejecutar" (run) and "Exterior Caminar" (walk) |
| `provisional-v1-legacy.json` | Older shape: plain numbers, `latitude`/`longitude`, miles, `heartRate.avg`, ISO dates, no `id` |
