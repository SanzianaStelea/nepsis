---
# ȘABLON PENTRU UN EVENIMENT NOU
# 1. Copiază tot conținutul acestui fișier.
# 2. Creează un fișier nou în src/content/evenimente/ cu numele de forma:
#    2026-05-17-numele-evenimentului.md  (data + un nume scurt, fără spații și diacritice)
# 3. Completează câmpurile de mai jos și scrie descrierea sub a doua linie „---”.
# 4. Șterge liniile care încep cu „#” (sunt doar explicații).

# Titlul evenimentului, între ghilimele:
title: "Titlul evenimentului"

# Data în formatul AN-LUNĂ-ZI:
date: 2026-05-17

# Locația (opțional — șterge linia dacă nu e cazul):
location: "Parohia Ortodoxă Română, Lausanne"

# Afișul sau o poză (opțional). Încarcă întâi afișul în public/img/evenimente/<numele-acestui-fișier>/
# apoi scrie aici calea lui:
image: /img/evenimente/2026-09-20-exemplu/afis.jpg
imageAlt: "Descrierea pozei (pentru nevăzători și Google)"

# Link de înscriere, de ex. un formular Google (opțional):
registrationLink: https://forms.gle/exemplu

# Limba textului: ro, fr, en sau de
lang: ro

# Un cod care leagă traducerile aceluiași eveniment între ele.
# Folosește același translationKey în fișierul românesc și în traducerile lui.
translationKey: numele-evenimentului-2026
---

Aici scrii descrierea evenimentului, ca un text obișnuit.

Poți folosi **litere îngroșate**, liste:

- prima idee
- a doua idee

și [link-uri](https://exemplu.ch).
