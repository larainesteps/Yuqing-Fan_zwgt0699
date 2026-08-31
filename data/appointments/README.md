# Appointment data — attribution and provenance

## Source

`scheduled_appointments.csv` is derived from:

> Gonzalez Galtier, C. (2024). *Medical Appointment Scheduling System: A Synthetic Resource
> for Clinical Management and Healthcare Analytics* [Dataset]. Kaggle.
> https://www.kaggle.com/datasets/carogonzalezgaltier/medical-appointment-scheduling-system

Licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**:
https://creativecommons.org/licenses/by/4.0/

## The data is synthetic

The publisher states that the dataset was synthetically generated and may not reflect
real-world data. Patient names are produced with the Faker library, insurance provider names
are fictitious, and the age and sex distributions are calibrated against published outpatient
attendance statistics rather than drawn from individual records.

**No record refers to an identifiable person.** No data in this project was obtained from a
healthcare organisation.

## This file is a derivative work

The published `appointments.csv` has 16 columns and supplies appointment timing, duration,
waiting time and patient demographics. It contains no surgical scheduling information.

The 11 columns below were **derived for this project** and are not part of the published
dataset:

| Derived column | What it represents |
|---|---|
| `service_type` | Assigned service line (surgery / ICU / emergency / general_medicine) |
| `schedule_status` | Scheduling state used by the prototype |
| `surgery_date` | Date of the surgical episode |
| `surgery_start`, `surgery_end` | Surgical episode boundaries |
| `prep_start` | Start of the preparation period preceding surgery |
| `assigned_doctors` | Doctor codes allocated to the case |
| `assigned_nurses` | Nurse codes allocated to the case |
| `assigned_theatre` | Theatre code allocated to the case |
| `assigned_bed` | Post-operative bed code allocated to the case |
| `delay_days` | Days between requested and scheduled date |

One column was renamed: the published `appointment_duration` appears here as
`original_appointment_duration_minutes`.

The remaining 16 columns are carried through unchanged from the published dataset.

> **Limitation.** The script that produced the derived columns belonged to an earlier
> prototype and is not part of this project. The derivation from the published dataset is
> therefore not reproducible from this repository; the derived file is included so that
> everything downstream of it — import, scheduling and the experiments — is.

## Use

```
node database/import-real-data.mjs data/appointments/scheduled_appointments.csv
```

111,488 rows. The import cleans and normalises the records, writes `patients`,
`schedule_results` and `resource_bookings`, expands each resource assignment into one booking
row per occupied resource, and reports any overlapping use of a resource.
