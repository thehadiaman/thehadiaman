// The eight stops and what each one says. Everything here comes from the CV.
import { ARRIVAL } from '../content.js';

const EMAIL = 'hadiaman.official@gmail.com';

export const CHAPTERS = [
  {
    id: 'home',
    short: 'Kozhikode',
    kicker: '01 · Kozhikode, Kerala',
    title: 'Hi, I’m Hadi.',
    html: `
      <p>Senior full stack developer, 4.5+ years in. I build software for the travel industry in
      TypeScript, Node.js, Angular and React, on PostgreSQL, Redis and AWS.</p>
      <p>This little world follows my route from Kozhikode to Dubai, where I’ll be from
      <strong>5 December 2026</strong>. Each stop is a chapter of the CV.</p>
      <ul class="card__facts">
        <li><span>Interviews</span> In person in Dubai from 5 Dec 2026</li>
        <li><span>Visa</span> Visit visa, 2 months</li>
        <li><span>Notice</span> 30 days, negotiable</li>
      </ul>`,
  },
  {
    id: 'college',
    short: 'College',
    kicker: '02 · College',
    title: 'Electrical first, then software',
    html: `
      <ul class="card__list">
        <li><strong>Diploma in Electrical and Electronics Engineering</strong><br>
        JDT Islam Polytechnic College, Calicut · 2017–2020 · 70%</li>
        <li><strong>Bachelor of Computer Applications</strong> (online)<br>
        Manipal University Jaipur · 2023–2026 · completed, degree attested for use in the UAE</li>
      </ul>
      <p class="card__note">The street lamps came on when you walked up. Old habits.</p>`,
  },
  {
    id: 'freelance',
    short: 'Freelance',
    kicker: '03 · Freelance · Feb–May 2021',
    title: 'First paid code',
    html: `
      <ul class="card__list">
        <li>A SaaS membership management system: Python, Django, Next.js, MongoDB.</li>
        <li>An ID card data-extraction microservice in Python using OCR, storing results in SQLite.</li>
      </ul>`,
  },
  {
    id: 'nucore',
    short: 'Nucore',
    kicker: '04 · Nucore Software Solutions · Jan 2022 – Dec 2025',
    title: 'An ERP that 240 travel agencies run on',
    html: `
      <p>Trainee developer, then Specialist in Development. Features and third-party integrations for
      <a href="https://nutraacs.com" target="_blank" rel="noopener">nuTRAACS</a>, a cloud-based, multi-tenant
      agency management ERP serving 240 travel agencies.</p>
      <div class="card__figures">
        <div><b>7 s → 0.5 s</b><span>configuration load, moved into Redis</span></div>
        <div><b>1 week → 4 h</b><span>per agency migration, automated</span></div>
      </div>
      <ul class="card__list">
        <li>Machine-to-machine pipelines moved six agencies off Oracle, MySQL and SQL Server. That’s the conveyor.</li>
        <li>A single sign-on platform for several cloud apps: concurrent logins, multi-tenancy, hardening.</li>
        <li>Token-based authorization, access control, API security, M2M access and secrets management.</li>
        <li><a href="https://nucem.co" target="_blank" rel="noopener">nuCEM</a>, a SaaS CRM with a Python backend and Angular frontend.</li>
        <li>Trivy in the Jenkins pipeline, AWS email automations, VAPT fixes.</li>
      </ul>`,
  },
  {
    id: 'projects',
    short: 'Projects',
    kicker: '05 · Side projects',
    title: 'Built on my own time',
    html: `
      <ul class="card__list">
        <li><strong><a href="https://github.com/thehadiaman/Whatsapp-Agent" target="_blank" rel="noopener">WhatsApp AI Support Desk</a></strong> (in progress)<br>
        Multi-tenant support desk for small businesses in India and the Gulf. A Claude Haiku assistant on AWS Bedrock
        answers from the business’s FAQs, catalogue and orders (RAG over pgvector, tool calling), hands off to staff,
        and speaks English, Hindi, Malayalam and Arabic. Signed webhooks go through BullMQ with dedupe, ordering and
        retries; a 1,000-message load test with injected faults produced no duplicate or out-of-order replies.
        Tested in mock mode; not deployed yet.</li>
        <li><strong><a href="https://github.com/thehadiaman/RAG-System" target="_blank" rel="noopener">Enterprise RAG System</a></strong><br>
        Answers questions over PDFs (tables, charts, scans) with page-level citations, and flags numbers that
        aren’t in the cited pages. ChromaDB hybrid search, Ollama and Bedrock, FastAPI in Docker.</li>
        <li><strong><a href="https://github.com/thehadiaman/diet-app" target="_blank" rel="noopener">Diet Tracker</a></strong><br>
        Kotlin Android app, multi-module Gradle.</li>
      </ul>`,
  },
  {
    id: 'airport',
    short: 'SNC',
    kicker: '06 · SNC · Senior Developer · Dec 2025 – now',
    title: 'Flight booking, 14 s down to 1.5 s',
    html: `
      <p>I built <a href="https://ticketing.buildmytravel.ae" target="_blank" rel="noopener">ticketing.buildmytravel.ae</a>,
      a live flight booking platform for a UAE travel company: Sabre GDS for search and booking, N-Genius
      payments, TypeScript (Node.js, React), PostgreSQL and Firebase on AWS.</p>
      <p>Sabre takes about 14 seconds to answer a search, and fares update in 15-minute windows. Caching Sabre’s
      responses in Redis for exactly that window brought search down to 1.5 seconds. Watch the two lights:
      one goes all the way out to Sabre, the other only to the cache.</p>
      <ul class="card__list">
        <li>Access tokens, access control, API security, 2FA with Google Authenticator.</li>
        <li>Docker deployments from GitHub to EC2 with AWS CodePipeline.</li>
        <li>Requirements straight from the client, the Sabre integration, and mentoring a junior developer.</li>
      </ul>
      <p><button type="button" class="card__btn" data-action="race">Run the search again</button></p>`,
  },
  {
    id: 'gate',
    short: 'Gate',
    kicker: '07 · Gate 1 · CCJ → DXB',
    title: 'Next: Dubai',
    html: `
      <p>Kozhikode to Dubai on <strong>5 December 2026</strong>, on a two-month visit visa. Available for
      in-person interviews in Dubai from that day. Notice period: 30 days, negotiable.</p>
      <p><button type="button" class="card__btn card__btn--go" data-action="board">Board the flight</button></p>`,
  },
  {
    id: 'dubai',
    short: 'Dubai',
    kicker: '08 · Dubai · from 5 Dec 2026',
    title: 'Let’s talk',
    html: `
      <p>Email is the quickest way to reach me. I’m in Dubai from 5 December 2026 and can meet in person from that day.</p>
      <p class="card__email"><a href="mailto:${EMAIL}">${EMAIL}</a>
        <button type="button" class="card__btn card__btn--small" data-action="copy">Copy</button></p>
      <ul class="card__facts">
        <li><span>UAE</span> <a href="tel:+971561983757">+971 56 198 3757</a></li>
        <li><span>India</span> <a href="tel:+918281177057">+91 82811 77057</a></li>
        <li><span>LinkedIn</span> <a href="https://www.linkedin.com/in/hadiaman" target="_blank" rel="noopener">linkedin.com/in/hadiaman</a></li>
        <li><span>GitHub</span> <a href="https://github.com/thehadiaman" target="_blank" rel="noopener">github.com/thehadiaman</a></li>
        <li><span>CV</span> <a href="assets/hadi-aman-cv.pdf">PDF, 2 pages</a> · <a href="cv.html">plain page</a></li>
      </ul>`,
  },
];

export { ARRIVAL, EMAIL };
