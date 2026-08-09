import { Link } from 'react-router-dom'
import LegalPage, { ContactPoint, LegalList, LegalSection } from '../components/LegalPage'

/* GDPR-style privacy policy. Keep this in sync with what the app
   actually does: the data inventory mirrors the schema in
   supabase/migrations/00001_init.sql, and the deletion section
   mirrors erase_account() in 00004_account_deletion.sql. */

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Fresno Skillshare is a small, invite-only community co-op where neighbors trade goods and services. We collect the minimum we need to run it, we never sell your information, and you can delete your account yourself at any time. This policy explains what we collect, why, who can see it, and the rights you have over it."
    >
      <LegalSection title="1. Who we are">
        <p>
          Fresno Skillshare is a community cooperative based in Fresno, California, and is the data
          controller for the personal information described in this policy. For anything related to
          your data, message <ContactPoint />.
        </p>
      </LegalSection>

      <LegalSection title="2. What we collect">
        <p>We only collect information you give us or that is needed to keep the service working:</p>
        <LegalList>
          <li>
            <strong className="text-stone-800">Account and sign-in.</strong> Your email address and
            a password (stored only as a secure hash by our authentication provider). If you sign in
            with Google, we receive your name, email address, and profile photo from Google instead
            of a password.
          </li>
          <li>
            <strong className="text-stone-800">Profile.</strong> Your display name and, if you choose
            to add them, a profile photo you upload, a short bio, and a location. All of these
            except your display name are optional. Uploaded photos are stored with our database
            provider and served from a link that contains a long random identifier, so it is not
            guessable, but anyone who has the link can view the photo.
          </li>
          <li>
            <strong className="text-stone-800">Community activity.</strong> The listings you post,
            the messages you exchange with other members, the trades you propose and complete
            (including their task checklists), the reviews and vouches you write and receive, and
            the badges you earn.
          </li>
          <li>
            <strong className="text-stone-800">Join requests.</strong> If you ask to join from the
            home page, we keep the name, email address, and message you send until an admin reviews
            it.
          </li>
          <li>
            <strong className="text-stone-800">Technical data.</strong> Short-lived request counters
            keyed by your account (or, for visitors, your IP address) that protect the site against
            spam and abuse. These are automatically cleaned up within about a day.
          </li>
        </LegalList>
        <p>
          We do not run advertising, analytics, or tracking of any kind, and we do not collect
          precise location, payment details, or anything from your device beyond what is listed
          above.
        </p>
      </LegalSection>

      <LegalSection title="3. Why we use it (legal bases)">
        <p>Under the GDPR, each use of your data needs a legal basis. Ours are:</p>
        <LegalList>
          <li>
            <strong className="text-stone-800">Performing our agreement with you</strong> (Art.
            6(1)(b)): creating your account, showing your profile and listings to other members,
            delivering messages, and recording trades and reviews — the things the co-op exists to
            do.
          </li>
          <li>
            <strong className="text-stone-800">Legitimate interests</strong> (Art. 6(1)(f)): keeping
            the community safe and honest — rate limiting, preventing spam and abuse, moderating
            content, and preserving the integrity of trade and review history that other members
            rely on.
          </li>
          <li>
            <strong className="text-stone-800">Consent</strong> (Art. 6(1)(a)): the optional profile
            fields (avatar, bio, location). You can edit or remove them at any time from your
            profile, which withdraws that consent.
          </li>
          <li>
            <strong className="text-stone-800">Legal obligations</strong> (Art. 6(1)(c)): where we
            must keep or disclose information to comply with the law.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="4. Cookies and local storage">
        <p>
          We use browser storage for one thing: keeping you signed in. There are no advertising or
          tracking cookies, and no third-party analytics scripts.
        </p>
      </LegalSection>

      <LegalSection title="5. Who can see your information">
        <LegalList>
          <li>
            <strong className="text-stone-800">Other members.</strong> Fresno Skillshare is members-only.
            Your profile, listings, reviews, and badges are visible to approved members; your
            messages are visible only to the person you are messaging; your trades are visible only
            to your trade partner. Nothing about you is visible to the public internet.
          </li>
          <li>
            <strong className="text-stone-800">Admins.</strong> Co-op admins can see member profiles
            and join requests in order to approve, support, and moderate the community. Admins
            cannot read your private messages.
          </li>
          <li>
            <strong className="text-stone-800">Service providers.</strong> We use Supabase to host
            our database, authentication, and uploaded profile photos, Google if you choose Google
            sign-in, and a web hosting provider to serve the site. They process data on our behalf and under their own
            contractual safeguards.
          </li>
        </LegalList>
        <p>
          We never sell your personal information or share it with advertisers. We would only
          disclose it if the law required us to.
        </p>
      </LegalSection>

      <LegalSection title="6. How long we keep it">
        <p>
          We keep your information for as long as your account exists. Anti-abuse counters are
          deleted within about a day. Join requests and invites are kept until they are acted on and
          are removed when the account they concern is deleted. What happens on account deletion is
          described in the next section.
        </p>
      </LegalSection>

      <LegalSection title="7. Deleting your account">
        <p>
          You can delete your account yourself at any time from your profile page. Deletion is
          immediate, permanent, and signs you out of every device. When you delete your account, we
          erase:
        </p>
        <LegalList>
          <li>your email address, password, and Google sign-in link,</li>
          <li>your display name, profile photo (including the uploaded file), bio, and location,</li>
          <li>all of your listings,</li>
          <li>any invites or join requests tied to your email address, and</li>
          <li>anti-abuse counters tied to your account.</li>
        </LegalList>
        <p>
          One important exception: <strong className="text-stone-800">things you did together with
          other members are not deleted.</strong> Messages you sent, reviews and vouches you wrote,
          and trades you took part in are also part of the other member&apos;s history, and removing
          them would erase their records and distort the reputation system the co-op depends on.
          Instead, those records are kept but anonymized: your name on them becomes
          &ldquo;Deleted member&rdquo; and nothing on them links back to you personally. We retain
          them on the basis of our legitimate interest in the integrity of other members&apos;
          records (GDPR Art. 17(3)).
        </p>
        <p>
          If a review about you concerns you, you can ask us to look at it — see your rights below.
        </p>
      </LegalSection>

      <LegalSection title="8. Your rights">
        <p>Under the GDPR you have the right to:</p>
        <LegalList>
          <li>
            <strong className="text-stone-800">Access</strong> a copy of the personal data we hold
            about you,
          </li>
          <li>
            <strong className="text-stone-800">Rectify</strong> it — most of it you can edit
            directly on your profile,
          </li>
          <li>
            <strong className="text-stone-800">Erase</strong> it — use the delete-account option on
            your profile, or contact us,
          </li>
          <li>
            <strong className="text-stone-800">Receive</strong> your data in a portable format,
          </li>
          <li>
            <strong className="text-stone-800">Restrict or object to</strong> processing based on
            our legitimate interests, and
          </li>
          <li>
            <strong className="text-stone-800">Withdraw consent</strong> for the optional profile
            fields at any time.
          </li>
        </LegalList>
        <p>
          To exercise any of these, message <ContactPoint />. We will respond within one month. If you
          are in the EU or UK, you also have the right to complain to your local data protection
          authority. California residents have comparable rights under the CCPA, including the right
          to know, delete, and not be discriminated against for exercising them — the same email
          works for those requests too.
        </p>
      </LegalSection>

      <LegalSection title="9. Where your data lives">
        <p>
          Our database and authentication are hosted by Supabase on infrastructure located in the
          United States. If you use the service from the EU or UK, your data is transferred to the
          US under our providers&apos; standard contractual safeguards.
        </p>
      </LegalSection>

      <LegalSection title="10. Children">
        <p>
          Fresno Skillshare is for adults. The service is not directed at children, and we do not
          knowingly collect data from anyone under 16. If you believe a child has an account,
          contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to this policy">
        <p>
          <strong className="text-stone-800">
            We may change this policy at any time, at our sole discretion, without notice to you.
          </strong>{' '}
          Changes take effect the moment the updated policy is posted, and the date at the top
          reflects the latest version. We are not obligated to announce changes, though we may. It is
          your responsibility to review this policy periodically, and your continued use of the
          service after any change means you accept it.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          Questions about privacy or your data: message <ContactPoint />. See also our{' '}
          <Link to="/terms" className="font-medium text-emerald-700 underline underline-offset-2">
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
