---
layout: default
title: "소개"
permalink: /about/
---

<section class="about-page">
  <p class="eyebrow">BEHIND THE WORDS</p>
  {% include avatar.html large=true %}
  <h1>{{ site.data.profile.name | escape }}</h1>
  <p class="about-tagline">{{ site.data.profile.tagline | default: site.description | escape }}</p>
  {% if site.data.profile.bio and site.data.profile.bio != '' %}<div class="about-bio">{{ site.data.profile.bio | escape | newline_to_br }}</div>{% else %}<div class="about-bio"><p>시와 에세이, 일상의 기록이 모이는 작은 공간입니다.<br />천천히 읽고, 잠시 머물러 주세요.</p></div>{% endif %}
  {% assign website_start = site.data.profile.website | slice: 0, 8 %}
  {% if website_start == 'https://' %}<a class="btn-light" href="{{ site.data.profile.website | escape }}" target="_blank" rel="noopener noreferrer">나의 다른 공간 ↗</a>{% endif %}
  <div class="about-bottom"><a class="text-link" href="{{ '/' | relative_url }}">{{ site.posts.size }}편의 기록 읽기 →</a><a class="text-link muted" href="{{ '/write/#profile' | relative_url }}">프로필 편집</a></div>
</section>
