---
# ȘABLON PENTRU O AMINTIRE NOUĂ
# 1. Copiază tot conținutul acestui fișier.
# 2. Creează un fișier nou în src/content/amintiri/ cu numele de forma:
#    2026-numele-amintirii.md  (anul + un nume scurt, fără spații și diacritice)
# 3. Completează câmpurile și scrie povestea sub a doua linie „---”.
# 4. Șterge liniile care încep cu „#” (sunt doar explicații).

# Titlul amintirii, între ghilimele:
title: "Titlul amintirii"

# Anul în care s-a întâmplat (după el se grupează automat pe pagină):
year: 2026

# Data exactă, în formatul AN-LUNĂ-ZI (opțional, dar ajută la ordonare):
date: 2026-05-17

# Locul (opțional), afișat lângă dată — de ex. „Geneva” sau „Lauterbrunnen”.
# Scrie-l doar dacă îl știi sigur; altfel șterge linia.
location: "Geneva"

# Ce mai lipsește (opțional): text, photos și/sau translation.
# Nu apare pe site — e doar o listă de lucru, afișată ca avertisment la build
# („[amintiri] lipsește: …”). Șterge linia când amintirea e completă.
missing: [photos]

# Pozele amintirii (poți pune oricâte; încarcă-le întâi în public/img/amintiri/<numele-acestui-fișier>/, numite 01.jpg, 02.jpg…; prima e coperta).
# Dacă pe card coperta e tăiată prost, adaugă și: coverPosition: "50% 85%" (al doilea număr: 0% = sus, 100% = jos).
# Pentru fiecare poză scrie calea și o scurtă descriere:
images:
  - src: /img/amintiri/2026-exemplu/01.jpg
    alt: "Descrierea primei poze"
  - src: /img/amintiri/2026-exemplu/02.jpg
    alt: "Descrierea celei de-a doua poze"

# Limba textului: ro, fr, en sau de
lang: ro

# Un cod unic pentru această amintire (leagă eventualele traduceri):
translationKey: amintire-2026-numele-amintirii
---

Aici scrii povestea: cum a fost, cine a participat, ce ați trăit împreună.

Un paragraf nou = o linie goală între rânduri.
