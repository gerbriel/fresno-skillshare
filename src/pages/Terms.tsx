import { Link } from 'react-router-dom'
import LegalPage, { ContactPoint, LegalList, LegalSection } from '../components/LegalPage'

/* Terms of membership. The account-deletion section must stay in
   sync with the Privacy Policy and with erase_account() in
   supabase/migrations/00004_account_deletion.sql. */

export default function Terms() {
  return (
    <LegalPage
      title="Terms &amp; Conditions"
      intro="These terms are the agreement between you and Fresno Skillshare when you use the service. The short version: be honest, trade in good faith, remember that trades are between you and your neighbor — not with us — and treat people the way you would across a back fence."
    >
      <LegalSection title="1. Accepting these terms">
        <p>
          By creating an account or using Fresno Skillshare you agree to these terms and to our{' '}
          <Link to="/privacy" className="font-medium text-emerald-700 underline underline-offset-2">
            Privacy Policy
          </Link>
          . If you do not agree, please do not use the service.
        </p>
        <p>
          Membership is invite-only: you join by invitation from a member or by requesting to join
          and being approved by an admin. You must be at least 18 years old.
        </p>
      </LegalSection>

      <LegalSection title="2. Your account">
        <LegalList>
          <li>Give accurate information when you sign up and keep your profile truthful.</li>
          <li>Keep your password private. You are responsible for activity on your account.</li>
          <li>One account per person. Do not share, sell, or transfer your account.</li>
          <li>Tell us right away if you think your account has been compromised.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="3. What Fresno Skillshare is (and is not)">
        <p>
          Fresno Skillshare is a bulletin board and messaging space where neighbors arrange to trade
          goods and services directly with each other. No money changes hands through the service
          and we charge no fees.
        </p>
        <p>
          <strong className="text-stone-800">We are not a party to any trade.</strong> We do not
          vet, inspect, or guarantee any member, listing, good, or service. Reviews and vouches are
          other members&apos; opinions, not our endorsement. Whether, how, and with whom you trade
          is entirely your decision and your responsibility.
        </p>
      </LegalSection>

      <LegalSection title="4. Trades are between members">
        <LegalList>
          <li>
            You are responsible for what you offer: that you own it or are qualified to do it, that
            it is legal, and that it is as described.
          </li>
          <li>
            You are responsible for judging what you receive. Meet safely, ask questions, and use
            the review history the way you would a neighbor&apos;s reputation.
          </li>
          <li>
            Bartering can have tax consequences. The fair market value of goods and services you
            receive in a trade may be taxable income; handling that is your responsibility, not
            ours.
          </li>
          <li>
            Disputes about a trade are between the members involved. Admins may step in to moderate
            the platform side (listings, reviews, access) but do not arbitrate trades.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="5. Acceptable use">
        <p>Do not use Fresno Skillshare to:</p>
        <LegalList>
          <li>
            offer or seek anything illegal, dangerous, or regulated (weapons, drugs, prescription
            items, stolen goods, services requiring a license you do not hold),
          </li>
          <li>harass, threaten, defame, or discriminate against anyone,</li>
          <li>post spam, advertising for outside businesses, or misleading listings,</li>
          <li>write dishonest reviews or vouch for trades that did not happen,</li>
          <li>collect or scrape other members&apos; information, or</li>
          <li>probe, overload, or interfere with the security of the service.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="6. Your content">
        <p>
          You own what you post — listings, messages, reviews, and profile details. By posting, you
          give Fresno Skillshare permission to store and display that content within the service so
          members can see it; that is the only use we make of it.
        </p>
        <p>
          Admins may edit or remove content that breaks these terms or harms the community, at their
          discretion.
        </p>
      </LegalSection>

      <LegalSection title="7. Suspension and removal">
        <p>
          Admins may suspend or permanently remove an account that breaks these terms, abuses other
          members, or harms the co-op — with or without warning, depending on severity. A suspended
          member loses access until an admin reactivates them. If an account is removed, the same
          rules about retained community records in section 8 apply.
        </p>
      </LegalSection>

      <LegalSection title="8. Deleting your account">
        <p>
          You can delete your account at any time from your profile page. Deletion is immediate and
          permanent: your sign-in, email, profile details, and listings are erased, and you are
          signed out of all devices.
        </p>
        <p>
          <strong className="text-stone-800">What you did with other members stays.</strong>{' '}
          Messages you sent, reviews and vouches you wrote, and trades you took part in are part of
          the other member&apos;s history too, so they are kept — anonymized and attributed to
          &ldquo;Deleted member&rdquo; — rather than deleted. This keeps conversations, reputations,
          and trade records intact for the people you dealt with. Details are in the{' '}
          <Link to="/privacy" className="font-medium text-emerald-700 underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="9. Disclaimers">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
          warranties of any kind, express or implied. We do not promise the service will be
          uninterrupted, error-free, or that any member, listing, or trade will meet your
          expectations.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitation of liability">
        <p>
          To the fullest extent the law allows, Fresno Skillshare and its organizers are not liable for
          any indirect, incidental, or consequential damages, or for any loss or injury arising from
          trades between members, member conduct, or member content. Where liability cannot be
          excluded, it is limited to the greatest extent the law permits. Nothing in these terms
          limits liability that cannot legally be limited.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to these terms">
        <p>
          <strong className="text-stone-800">
            We may change these terms at any time, at our sole discretion, without notice to you.
          </strong>{' '}
          Changes take effect the moment the updated terms are posted, and the date at the top
          reflects the latest version. We are not obligated to announce changes, though we may. It is
          your responsibility to review these terms periodically. Continuing to use the service after
          any change means you accept the updated terms; if you do not agree, stop using the service
          and delete your account.
        </p>
      </LegalSection>

      <LegalSection title="12. Governing law">
        <p>
          These terms are governed by the laws of the State of California, and any dispute belongs
          in the state or federal courts located in Fresno County, California.
        </p>
      </LegalSection>

      <LegalSection title="13. Contact">
        <p>
          Questions about these terms: message <ContactPoint />.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
