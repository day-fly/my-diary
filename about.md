---
layout: default
title: "소개"
permalink: /about/
quote_text: "글처럼 살고, 삶처럼 쓰는 것."
quote_source_title: "작가 선언문"
quote_source_url: "/2026/02/14/entry-454909/"
illustration: "/assets/images/harusari-about-20261108.jpg"
illustration_small: "/assets/images/harusari-about-20261108-640.jpg"
illustration_alt: "햇살 드는 창가의 나무 책상 위에 펼친 노트와 만년필, 찻잔이 놓인 수채화"
illustration_width: 1200
illustration_height: 900
---

<section class="about-page">
  <p class="eyebrow">BEHIND THE WORDS</p>
  {% if site.data.profile.avatar and site.data.profile.avatar != '' %}{% include avatar.html large=true %}{% endif %}
  <h1>{{ site.data.profile.name | escape }}</h1>
  {% if site.data.profile.tagline == page.quote_text %}
  <blockquote class="about-quote">
    <p>“{{ site.data.profile.tagline | escape }}”</p>
    <cite><a href="{{ page.quote_source_url | relative_url }}">— 「{{ page.quote_source_title | escape }}」 중에서</a></cite>
  </blockquote>
  {% else %}<p class="about-tagline">{{ site.data.profile.tagline | default: site.description | escape }}</p>{% endif %}
  <div class="about-story{% if page.illustration %} about-story-illustrated{% endif %}">
    {% if page.illustration %}
    <figure class="about-illustration">
      <img src="{{ page.illustration | relative_url }}" srcset="{{ page.illustration_small | relative_url }} 640w, {{ page.illustration | relative_url }} 1200w" sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1016px) calc(50vw - 50px), 458px" width="{{ page.illustration_width }}" height="{{ page.illustration_height }}" alt="{{ page.illustration_alt | escape }}" decoding="async" />
    </figure>
    {% endif %}
    {% if site.data.profile.bio and site.data.profile.bio != '' %}<div class="about-bio">{{ site.data.profile.bio | escape | newline_to_br }}</div>{% else %}<div class="about-bio"><p>시와 에세이, 일상의 기록이 모이는 작은 공간입니다.<br />천천히 읽고, 잠시 머물러 주세요.</p></div>{% endif %}
  </div>
  {% assign website_start = site.data.profile.website | slice: 0, 8 %}
  {% if website_start == 'https://' %}<a class="btn-light" href="{{ site.data.profile.website | escape }}" target="_blank" rel="noopener noreferrer">나의 다른 공간 ↗</a>{% endif %}
  <div class="about-bottom"><a class="text-link" href="{{ '/' | relative_url }}">{{ site.posts.size }}편의 기록 읽기 →</a><a class="text-link muted" href="{{ '/write/#profile' | relative_url }}">프로필 편집</a></div>
</section>
