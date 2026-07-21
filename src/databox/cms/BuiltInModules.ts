import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
import { CMS } from '../../util/Vocabularies';
import { MENU_MODULE_MANIFEST } from './modules/menu/Menu';
import { CASH_REGISTER_MODULE_MANIFEST } from './modules/pos/CashRegister';
import { NATIVE_POS_DEVICE_MODULE_MANIFEST } from './modules/pos/NativePosDeviceContract';
import { TABLE_SESSION_MODULE_MANIFEST } from './modules/pos/TableSession';
import { WEBSITE_SEO_MODULE_MANIFEST } from './modules/website/PublicFeedRenderer';
import { SITEMAP_ROBOTS_MODULE_MANIFEST } from './modules/website/SitemapRobots';

export function ensureBuiltIns(registry: DataboxModuleRegistry): void {
  if (!registry.get('bookings')) {
    registry.register({
      id: 'bookings',
      name: 'Bookings & Availability',
      version: '0.1.0',
      description: 'Compute free time slots and issue schema.org reservations.',
      capabilities: [ 'cms:bookings', 'cms:availability', 'cms:reservation' ],
      routes: [
        'POST /.databox/cms/bookings/availability',
        'POST /.databox/cms/bookings/reservation/build',
      ],
      configShape: `${CMS.namespace}BookingsConfigShape`,
      adminUi: {
        navLabel: 'Bookings',
        path: '/bookings',
      },
    });
  }
  if (!registry.isEnabled('bookings')) {
    registry.setEnabled('bookings', true);
  }

  if (!registry.get('jobs')) {
    registry.register({
      id: 'jobs',
      name: 'Jobs / Work Orders',
      version: '0.1.0',
      description: 'Production workflows (intake -> queue -> produce -> finish -> ready).',
      capabilities: [ 'cms:jobs', 'cms:work-orders' ],
      routes: [ 'POST /.databox/cms/jobs/advance' ],
      configShape: `${CMS.namespace}JobsConfigShape`,
      adminUi: { navLabel: 'Jobs', path: '/jobs' },
    });
  }
  if (!registry.isEnabled('jobs')) {
    registry.setEnabled('jobs', true);
  }

  if (!registry.get('payments')) {
    registry.register({
      id: 'payments',
      name: 'Payments & Receipts',
      version: '0.1.0',
      description: 'Payment logic including taxes, splits, subscriptions, refunds, and verifiable receipts.',
      capabilities: [ 'cms:payments', 'cms:receipts' ],
      routes: [
        'POST /.databox/cms/payments/receipt/build',
        'POST /.databox/cms/payments/refund/compute',
        'POST /.databox/cms/payments/split/compute',
        'POST /.databox/cms/payments/subscription/next-date',
        'POST /.databox/cms/payments/subscription/is-due',
        'POST /.databox/cms/payments/tax/compute',
      ],
      configShape: `${CMS.namespace}PaymentsConfigShape`,
      adminUi: { navLabel: 'Payments', path: '/payments' },
    });
  }
  if (!registry.isEnabled('payments')) {
    registry.setEnabled('payments', true);
  }

  if (!registry.get('catalogue')) {
    registry.register({
      id: 'catalogue',
      name: 'Catalogue Variants',
      version: '0.1.0',
      description: 'Expand a product\'s options into the full variant / SKU matrix.',
      capabilities: [ 'cms:catalogue', 'cms:catalogue-variants' ],
      routes: [ 'POST /.databox/cms/catalogue/variants/build' ],
      configShape: `${CMS.namespace}CatalogueConfigShape`,
      adminUi: {
        navLabel: 'Catalogue',
        path: '/catalogue',
      },
    });
  }
  if (!registry.isEnabled('catalogue')) {
    registry.setEnabled('catalogue', true);
  }

  if (!registry.get('feeds')) {
    registry.register({
      id: 'feeds',
      name: 'RDF Feeds',
      version: '0.1.0',
      description: 'Publish the business\'s things as public machine-readable feeds (schema.org JSON-LD syndication).',
      capabilities: [ 'cms:feeds', 'cms:rdf-syndication' ],
      routes: [ 'POST /.databox/cms/feeds/products/build' ],
      configShape: `${CMS.namespace}FeedsConfigShape`,
      adminUi: {
        navLabel: 'Feeds',
        path: '/feeds',
      },
    });
  }
  if (!registry.isEnabled('feeds')) {
    registry.setEnabled('feeds', true);
  }

  if (!registry.get('hosting')) {
    registry.register({
      id: 'hosting',
      name: 'Hosting',
      version: '0.1.0',
      description: 'Guided domain, DNS and launch-configuration planning for the CMS profile.',
      capabilities: [ 'cms:hosting', 'cms:dns-plan' ],
      routes: [
        'POST /.databox/cms/hosting/plan',
        'POST /.databox/cms/hosting/apply',
        'POST /.databox/cms/hosting/persist',
        'POST /.databox/cms/hosting/bind',
        'POST /.databox/cms/hosting/artifacts',
      ],
      configShape: `${CMS.namespace}HostingConfigShape`,
      adminUi: {
        navLabel: 'Hosting',
        path: '/hosting',
      },
    });
  }
  if (!registry.get('governance')) {
    registry.register({
      id: 'governance',
      name: 'Governance',
      version: '0.1.0',
      description: 'Role-to-authority bindings, ODRL policy encoding, approval gates, and resolution recording.',
      capabilities: [ 'cms:governance', 'cms:odrl', 'cms:approval-gate', 'cms:resolution' ],
      routes: [
        'POST /.databox/cms/governance/role/bind',
        'POST /.databox/cms/governance/odrl/policy',
        'POST /.databox/cms/governance/approval-gate',
        'POST /.databox/cms/governance/resolution',
      ],
      configShape: `${CMS.namespace}GovernanceConfigShape`,
      adminUi: {
        navLabel: 'Governance',
        path: '/governance',
      },
    });
  }
  if (!registry.get('credentials')) {
    registry.register({
      id: 'credentials',
      name: 'Credentials',
      version: '0.1.0',
      description: 'Verifiable credential issuance, verification, and revocation lifecycle.',
      capabilities: [ 'cms:credentials', 'cms:vc-issuance', 'cms:vc-verification', 'cms:vc-revocation' ],
      routes: [
        'POST /.databox/cms/credentials/issue',
        'POST /.databox/cms/credentials/verify',
        'POST /.databox/cms/credentials/revoke',
      ],
      configShape: `${CMS.namespace}CredentialsConfigShape`,
      adminUi: {
        navLabel: 'Credentials',
        path: '/credentials',
      },
    });
  }
  if (!registry.get('profile')) {
    registry.register({
      id: 'profile',
      name: 'Member Pods & Profiles',
      version: '0.1.0',
      description: 'Member/person pod provisioning, LDN inbox communication, bidirectional interaction, and lifecycle management.',
      capabilities: [ 'cms:profile', 'cms:member-pod', 'cms:ldn-inbox', 'cms:member-interaction', 'cms:member-lifecycle' ],
      routes: [
        'POST /.databox/cms/profile/build',
        'POST /.databox/cms/members/provision',
        'POST /.databox/cms/members/lifecycle',
        'POST /.databox/cms/ldn/notification',
        'POST /.databox/cms/ldn/inbox/create',
        'POST /.databox/cms/ldn/send',
        'POST /.databox/cms/members/notify',
        'POST /.databox/cms/members/notify-organisation',
        'POST /.databox/cms/members/access-grant',
      ],
      configShape: `${CMS.namespace}ProfileConfigShape`,
      adminUi: {
        navLabel: 'Members',
        path: '/members',
      },
    });
  }
  if (!registry.get('receipt')) {
    registry.register({
      id: 'receipt',
      name: 'Receipt Writer',
      version: '0.1.0',
      description: 'Printable receipt documents with QR links to the consumer RDF/VC receipt in the pod.',
      capabilities: [
        'cms:receipt-document',
        'cms:portable-core-receipt-doc',
        'cms:css-enhanced-receipt-build-route',
        'cms:native-edge-print-job-descriptor',
      ],
      routes: [ 'POST /.databox/cms/receipt/build' ],
      configShape: `${CMS.namespace}ReceiptConfigShape`,
      adminUi: {
        navLabel: 'Receipts',
        path: '/receipts',
      },
    });
  }
  if (!registry.get('pos.ordering')) {
    registry.register({
      id: 'pos.ordering',
      name: 'Point of Sale',
      version: '0.1.0',
      description:
        'Portable POS cart, order, ticket, waiter, customer self-order, payment-handoff and receipt-intent records.',
      capabilities: [
        'pos:cart',
        'pos:order-record',
        'pos:ticket-state',
        'pos:waiter-order',
        'pos:customer-self-order',
        'pos:payment-handoff',
        'cms:portable-core-pos-ordering',
        'cms:css-enhanced-pos-order-store',
      ],
      routes: [ 'POST /.databox/cms/pos/orders', 'GET /.databox/cms/pos/orders' ],
      configShape: `${CMS.namespace}PosOrderingConfigShape`,
      adminUi: {
        navLabel: 'POS Terminal',
        path: '/pos',
      },
    });
  }
  if (!registry.get('pos.promotions-display')) {
    registry.register({
      id: 'pos.promotions-display',
      name: 'Promotions and Customer Display',
      version: '0.1.0',
      description:
        'Portable promotion rules, customer-facing transaction summaries, app/vault links, ' +
        'and automated display decks.',
      capabilities: [
        'pos:promotion-offer',
        'pos:customer-display',
        'pos:display-deck',
        'pos:shop-app-install-link',
        'pos:solid-vault-connect-link',
        'cms:portable-core-customer-display',
        'cms:css-enhanced-customer-display-store',
      ],
      routes: [ 'POST /.databox/cms/pos/display', 'GET /.databox/cms/pos/display' ],
      configShape: `${CMS.namespace}PosPromotionsDisplayConfigShape`,
      adminUi: {
        navLabel: 'Display Preview',
        path: '/pos/display',
      },
    });
  }
  if (!registry.get(NATIVE_POS_DEVICE_MODULE_MANIFEST.id)) {
    registry.register(NATIVE_POS_DEVICE_MODULE_MANIFEST);
  }
  if (!registry.get(CASH_REGISTER_MODULE_MANIFEST.id)) {
    registry.register(CASH_REGISTER_MODULE_MANIFEST);
  }
  if (!registry.get(MENU_MODULE_MANIFEST.id)) {
    registry.register(MENU_MODULE_MANIFEST);
  }
  if (!registry.get(WEBSITE_SEO_MODULE_MANIFEST.id)) {
    registry.register(WEBSITE_SEO_MODULE_MANIFEST);
  }
  if (!registry.get(SITEMAP_ROBOTS_MODULE_MANIFEST.id)) {
    registry.register(SITEMAP_ROBOTS_MODULE_MANIFEST);
  }
  if (!registry.get(TABLE_SESSION_MODULE_MANIFEST.id)) {
    registry.register(TABLE_SESSION_MODULE_MANIFEST);
  }
  if (!registry.isEnabled('hosting')) {
    registry.setEnabled('hosting', true);
  }
  if (!registry.isEnabled('governance')) {
    registry.setEnabled('governance', true);
  }
  if (!registry.isEnabled('credentials')) {
    registry.setEnabled('credentials', true);
  }
  if (!registry.isEnabled('profile')) {
    registry.setEnabled('profile', true);
  }
  if (!registry.isEnabled('receipt')) {
    registry.setEnabled('receipt', true);
  }
  if (!registry.isEnabled('pos.ordering')) {
    registry.setEnabled('pos.ordering', true);
  }
  if (!registry.isEnabled('pos.promotions-display')) {
    registry.setEnabled('pos.promotions-display', true);
  }
  if (!registry.isEnabled(NATIVE_POS_DEVICE_MODULE_MANIFEST.id)) {
    registry.setEnabled(NATIVE_POS_DEVICE_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(CASH_REGISTER_MODULE_MANIFEST.id)) {
    registry.setEnabled(CASH_REGISTER_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(MENU_MODULE_MANIFEST.id)) {
    registry.setEnabled(MENU_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(WEBSITE_SEO_MODULE_MANIFEST.id)) {
    registry.setEnabled(WEBSITE_SEO_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(SITEMAP_ROBOTS_MODULE_MANIFEST.id)) {
    registry.setEnabled(SITEMAP_ROBOTS_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(TABLE_SESSION_MODULE_MANIFEST.id)) {
    registry.setEnabled(TABLE_SESSION_MODULE_MANIFEST.id, true);
  }

  const newModules: Record<string, { name: string; description: string; capabilities: string[]; routes: string[]; configShape: string; navLabel: string; path: string }> = {
    consent: {
      name: 'Consent Management',
      description: 'DPV-shaped consent records (grant/withdraw) as JSON-LD.',
      capabilities: [ 'cms:consent' ],
      routes: [ 'POST /.databox/cms/consent/build' ],
      configShape: `${CMS.namespace}ConsentConfigShape`,
      navLabel: 'Consent',
      path: '/consent',
    },
    delegation: {
      name: 'Delegation & Assisted Agency',
      description: 'Scoped, revocable delegation grants and validation.',
      capabilities: [ 'cms:delegation' ],
      routes: [ 'POST /.databox/cms/delegation/build', 'POST /.databox/cms/delegation/validate' ],
      configShape: `${CMS.namespace}DelegationConfigShape`,
      navLabel: 'Delegation',
      path: '/delegation',
    },
    emergency: {
      name: 'Emergency / Break-Glass Access',
      description: 'Break-glass access evaluation with audit trail.',
      capabilities: [ 'cms:break-glass' ],
      routes: [ 'POST /.databox/cms/emergency/break-glass' ],
      configShape: `${CMS.namespace}EmergencyConfigShape`,
      navLabel: 'Emergency',
      path: '/emergency',
    },
    household: {
      name: 'Household / Domestic Collective',
      description: 'Household entity with shared stewardship members.',
      capabilities: [ 'cms:household' ],
      routes: [ 'POST /.databox/cms/household/build' ],
      configShape: `${CMS.namespace}HouseholdConfigShape`,
      navLabel: 'Household',
      path: '/household',
    },
    inventory: {
      name: 'Inventory & Stock',
      description: 'Stock fulfillment checks and auditable stock records.',
      capabilities: [ 'cms:inventory', 'cms:stock' ],
      routes: [ 'POST /.databox/cms/inventory/check', 'POST /.databox/cms/inventory/record' ],
      configShape: `${CMS.namespace}InventoryConfigShape`,
      navLabel: 'Inventory',
      path: '/inventory',
    },
    loyalty: {
      name: 'Loyalty Programs',
      description: 'Loyalty points earn/redeem transactions and records.',
      capabilities: [ 'cms:loyalty' ],
      routes: [ 'POST /.databox/cms/loyalty/apply', 'POST /.databox/cms/loyalty/record' ],
      configShape: `${CMS.namespace}LoyaltyConfigShape`,
      navLabel: 'Loyalty',
      path: '/loyalty',
    },
    orgnetwork: {
      name: 'Federated Org Networks',
      description: 'Organizational unit hierarchy with parent relationships.',
      capabilities: [ 'cms:orgnetwork', 'cms:org-unit' ],
      routes: [ 'POST /.databox/cms/orgnetwork/unit' ],
      configShape: `${CMS.namespace}OrgNetworkConfigShape`,
      navLabel: 'Org Networks',
      path: '/orgnetwork',
    },
    pricing: {
      name: 'Wholesale / B2B Pricing',
      description: 'Tiered wholesale pricing with MOQ enforcement.',
      capabilities: [ 'cms:pricing', 'cms:wholesale' ],
      routes: [ 'POST /.databox/cms/pricing/wholesale' ],
      configShape: `${CMS.namespace}PricingConfigShape`,
      navLabel: 'Pricing',
      path: '/pricing',
    },
    a11y: {
      name: 'Accessibility Audit',
      description: 'Audit media and controls for accessibility issues.',
      capabilities: [ 'cms:a11y' ],
      routes: [ 'POST /.databox/cms/a11y/audit' ],
      configShape: `${CMS.namespace}A11yConfigShape`,
      navLabel: 'Accessibility',
      path: '/a11y',
    },
    business: {
      name: 'Business Hours',
      description: 'Opening hours schema.org records and open/closed checks.',
      capabilities: [ 'cms:business-hours' ],
      routes: [ 'POST /.databox/cms/business/hours/build', 'POST /.databox/cms/business/hours/check' ],
      configShape: `${CMS.namespace}BusinessHoursConfigShape`,
      navLabel: 'Business Hours',
      path: '/business',
    },
    consumer: {
      name: 'Consumer Rights',
      description: 'Data-subject access and correction requests.',
      capabilities: [ 'cms:consumer-rights', 'cms:access-request', 'cms:correction-request' ],
      routes: [ 'POST /.databox/cms/consumer/access-request', 'POST /.databox/cms/consumer/correction-request' ],
      configShape: `${CMS.namespace}ConsumerRightsConfigShape`,
      navLabel: 'Consumer Rights',
      path: '/consumer',
    },
    i18n: {
      name: 'Internationalization',
      description: 'Locale negotiation from Accept-Language headers.',
      capabilities: [ 'cms:i18n', 'cms:locale-negotiation' ],
      routes: [ 'POST /.databox/cms/i18n/negotiate' ],
      configShape: `${CMS.namespace}I18nConfigShape`,
      navLabel: 'i18n',
      path: '/i18n',
    },
    integration: {
      name: 'Enterprise Connectors',
      description: 'Portable connector manifest and job validation.',
      capabilities: [ 'cms:integration', 'cms:connector' ],
      routes: [ 'POST /.databox/cms/integration/manifest/validate', 'POST /.databox/cms/integration/job/validate' ],
      configShape: `${CMS.namespace}IntegrationConfigShape`,
      navLabel: 'Integration',
      path: '/integration',
    },
    theming: {
      name: 'Theming & Design Tokens',
      description: 'W3C DTCG design token validation, CSS compilation, and Forge token projection.',
      capabilities: [ 'cms:theming', 'cms:design-tokens' ],
      routes: [ 'POST /.databox/cms/theming/validate', 'POST /.databox/cms/theming/css', 'POST /.databox/cms/theming/forge-tokens' ],
      configShape: `${CMS.namespace}ThemingConfigShape`,
      navLabel: 'Theming',
      path: '/theming',
    },
    events: {
      name: 'Event Dispatcher',
      description: 'Dispatch and track schema.org events with attendance and status.',
      capabilities: [ 'cms:events', 'cms:event-dispatch' ],
      routes: [ 'POST /.databox/cms/events/event' ],
      configShape: `${CMS.namespace}EventsConfigShape`,
      navLabel: 'Events',
      path: '/events',
    },
    ticketing: {
      name: 'Ticketing',
      description: 'Issue and track tickets with QR codes and seat assignments.',
      capabilities: [ 'cms:ticketing', 'cms:tickets' ],
      routes: [ 'POST /.databox/cms/ticketing/ticket' ],
      configShape: `${CMS.namespace}TicketingConfigShape`,
      navLabel: 'Ticketing',
      path: '/ticketing',
    },
    provenance: {
      name: 'Provenance Tracking',
      description: 'W3C PROV-O provenance records for data lineage and audit.',
      capabilities: [ 'cms:provenance', 'cms:prov' ],
      routes: [ 'POST /.databox/cms/provenance' ],
      configShape: `${CMS.namespace}ProvenanceConfigShape`,
      navLabel: 'Provenance',
      path: '/provenance',
    },
    social: {
      name: 'Social Posts',
      description: 'Activity Streams social notes and posts.',
      capabilities: [ 'cms:social', 'cms:notes' ],
      routes: [ 'POST /.databox/cms/social/note' ],
      configShape: `${CMS.namespace}SocialConfigShape`,
      navLabel: 'Social',
      path: '/social',
    },
    records: {
      name: 'Records Management',
      description: 'Official record entries with retention and classification.',
      capabilities: [ 'cms:records', 'cms:record-entries' ],
      routes: [ 'POST /.databox/cms/records/entry' ],
      configShape: `${CMS.namespace}RecordsConfigShape`,
      navLabel: 'Records',
      path: '/records',
    },
    licensing: {
      name: 'Licensing & Permits',
      description: 'Issue licences and permits with scope and validity periods.',
      capabilities: [ 'cms:licensing', 'cms:licences', 'cms:permits' ],
      routes: [ 'POST /.databox/cms/licensing/licence', 'POST /.databox/cms/licensing/permit' ],
      configShape: `${CMS.namespace}LicensingConfigShape`,
      navLabel: 'Licensing',
      path: '/licensing',
    },
    reputation: {
      name: 'Reputation & Reviews',
      description: 'Aggregate ratings and reviews into reputation scores.',
      capabilities: [ 'cms:reputation', 'cms:reviews' ],
      routes: [ 'POST /.databox/cms/reputation/aggregate' ],
      configShape: `${CMS.namespace}ReputationConfigShape`,
      navLabel: 'Reputation',
      path: '/reputation',
    },
    delivery: {
      name: 'Delivery Management',
      description: 'Delivery requests with routing, tracking, and status.',
      capabilities: [ 'cms:delivery', 'cms:delivery-requests' ],
      routes: [ 'POST /.databox/cms/delivery/request' ],
      configShape: `${CMS.namespace}DeliveryConfigShape`,
      navLabel: 'Delivery',
      path: '/delivery',
    },
    access: {
      name: 'Access Control',
      description: 'Evaluate access requests against credential gate policies.',
      capabilities: [ 'cms:access', 'cms:credential-gate' ],
      routes: [ 'POST /.databox/cms/access/evaluate' ],
      configShape: `${CMS.namespace}AccessConfigShape`,
      navLabel: 'Access Control',
      path: '/access',
    },
    quotations: {
      name: 'Quotations',
      description: 'Build professional quotation documents with line items and PDF rendering.',
      capabilities: [ 'cms:quotations', 'cms:quotation-build' ],
      routes: [ 'POST /.databox/cms/quotations/build' ],
      configShape: `${CMS.namespace}QuotationsConfigShape`,
      navLabel: 'Quotations',
      path: '/quotations',
    },
    'mcp.server': {
      name: 'MCP Server',
      description: 'Model Context Protocol server for AI agent integration.',
      capabilities: [ 'cms:mcp', 'cms:mcp-server' ],
      routes: [ 'POST /.databox/cms/mcp/tools/list', 'POST /.databox/cms/mcp/tools/call' ],
      configShape: `${CMS.namespace}McpServerConfigShape`,
      navLabel: 'MCP Server',
      path: '/mcp',
    },
    tax: {
      name: 'Tax Management',
      description: 'Tax code management (GST/VAT/Sales Tax), tax rate rules per category, tax-inclusive/exclusive pricing, tax exemption certificates, tax reports as RDF.',
      capabilities: [ 'cms:tax', 'cms:tax-computation', 'cms:tax-exemption', 'cms:tax-report' ],
      routes: [ 'POST /.databox/cms/tax/compute', 'POST /.databox/cms/tax/report' ],
      configShape: `${CMS.namespace}TaxConfigShape`,
      navLabel: 'Tax',
      path: '/tax',
    },
    concessions: {
      name: 'Concessions',
      description: 'Concession rate management for eligible groups (pensioners, students, veterans), concession eligibility verification via VC, concession pricing rules at POS.',
      capabilities: [ 'cms:concessions', 'cms:concession-eligibility', 'cms:concession-pricing' ],
      routes: [ 'POST /.databox/cms/concessions/eligibility', 'POST /.databox/cms/concessions/pricing', 'POST /.databox/cms/concessions/record' ],
      configShape: `${CMS.namespace}ConcessionsConfigShape`,
      navLabel: 'Concessions',
      path: '/concessions',
    },
    discounts: {
      name: 'Discounts & Promotions',
      description: 'Discount code management (promo codes, seasonal sales, flash deals), bulk/quantity discounts, bundle discounts, member-only discounts, discount stacking rules.',
      capabilities: [ 'cms:discounts', 'cms:discount-codes', 'cms:promotions' ],
      routes: [ 'POST /.databox/cms/discounts/apply', 'POST /.databox/cms/discounts/record' ],
      configShape: `${CMS.namespace}DiscountsConfigShape`,
      navLabel: 'Discounts',
      path: '/discounts',
    },
    donations: {
      name: 'Donations & Fundraising',
      description: 'Donation campaign management, donation intake (one-off and recurring), donor receipts as VCs, transparency reporting, recurring donation scheduling.',
      capabilities: [ 'cms:donations', 'cms:donation-campaigns', 'cms:donation-receipts', 'cms:donation-transparency' ],
      routes: [ 'POST /.databox/cms/donations/process', 'POST /.databox/cms/donations/receipt', 'POST /.databox/cms/donations/transparency' ],
      configShape: `${CMS.namespace}DonationsConfigShape`,
      navLabel: 'Donations',
      path: '/donations',
    },
    notifications: {
      name: 'Notifications',
      description: 'Multi-channel notification management (in-app, email, SMS, push, LDN), channel subscriptions, priority-based dispatch, read tracking, topic filtering.',
      capabilities: [ 'cms:notifications', 'cms:notification-channels', 'cms:notification-subscriptions' ],
      routes: [ 'POST /.databox/cms/notifications/create', 'POST /.databox/cms/notifications/subscribe', 'POST /.databox/cms/notifications/read', 'POST /.databox/cms/notifications/query' ],
      configShape: `${CMS.namespace}NotificationsConfigShape`,
      navLabel: 'Notifications',
      path: '/notifications',
    },
    'allergy-profile': {
      name: 'Allergy & Ingredient Safety',
      description: 'Consumer allergy/dietary profile management, retailer ingredient declarations with FSANZ/EU allergen categories, allergen matching engine, selective disclosure for secret recipes.',
      capabilities: [ 'cms:allergy-profile', 'cms:ingredient-declaration', 'cms:allergen-matching', 'cms:selective-disclosure' ],
      routes: [ 'POST /.databox/cms/allergy-profile/build', 'POST /.databox/cms/ingredients/declare', 'POST /.databox/cms/allergens/match', 'POST /.databox/cms/allergens/batch-match', 'POST /.databox/cms/allergens/selective-disclosure' ],
      configShape: `${CMS.namespace}AllergyProfileConfigShape`,
      navLabel: 'Allergy Safety',
      path: '/allergy-safety',
    },
    'device-auth': {
      name: 'Device Identity (mTLS)',
      description: 'Device enrolment with keypair generation, mTLS client certificate verification, device revocation, WebID-TLS authentication for POS terminals, customer displays, and IoT devices.',
      capabilities: [ 'cms:device-auth', 'cms:device-enrolment', 'cms:device-revocation', 'cms:mtls' ],
      routes: [ 'POST /.databox/cms/device-auth/enrol', 'POST /.databox/cms/device-auth/verify', 'POST /.databox/cms/device-auth/revoke' ],
      configShape: `${CMS.namespace}DeviceAuthConfigShape`,
      navLabel: 'Device Auth',
      path: '/device-auth',
    },
    hr: {
      name: 'HR & Workforce',
      description: 'Employee/contractor onboarding, shift assignment, compliance credential tracking, payslip generation, expense claims.',
      capabilities: [ 'cms:hr', 'cms:hr-onboarding', 'cms:hr-shifts', 'cms:hr-compliance', 'cms:hr-payroll', 'cms:hr-expenses' ],
      routes: [ 'POST /.databox/cms/hr/onboard', 'POST /.databox/cms/hr/shift/assign', 'POST /.databox/cms/hr/compliance/track', 'POST /.databox/cms/hr/payslip/generate', 'POST /.databox/cms/hr/expense/claim' ],
      configShape: `${CMS.namespace}HrConfigShape`,
      navLabel: 'HR',
      path: '/hr',
    },
    'driver-management': {
      name: 'Delivery Driver Management',
      description: 'Driver registration with zones and availability, job offer creation, job status tracking, dispatch matching engine.',
      capabilities: [ 'cms:driver-management', 'cms:driver-registration', 'cms:job-offers', 'cms:dispatch' ],
      routes: [ 'POST /.databox/cms/delivery/driver/register', 'POST /.databox/cms/delivery/job/offer', 'POST /.databox/cms/delivery/job/status', 'POST /.databox/cms/delivery/dispatch/match' ],
      configShape: `${CMS.namespace}DriverManagementConfigShape`,
      navLabel: 'Drivers',
      path: '/drivers',
    },
    print: {
      name: 'Print Shop',
      description: 'Print service catalogue, job intake with specifications, job status tracking through prepress/proofing/printing/finishing pipeline, inter-org B2B print job submission with ODRL licence enforcement.',
      capabilities: [ 'cms:print', 'cms:print-services', 'cms:print-jobs', 'cms:print-inter-org' ],
      routes: [ 'POST /.databox/cms/print/service/create', 'POST /.databox/cms/print/job/create', 'POST /.databox/cms/print/job/status', 'POST /.databox/cms/print/inter-org/submit' ],
      configShape: `${CMS.namespace}PrintShopConfigShape`,
      navLabel: 'Print Shop',
      path: '/print',
    },
    'org-apps': {
      name: 'Org App Container',
      description: 'WASM/PWA container that fetches app profiles, UI modules, and per-install licences from the CMS. Supports local-only and remote-capable network scopes, per-install licence VCs, and profile-driven module availability.',
      capabilities: [ 'cms:org-apps', 'cms:app-profiles', 'cms:app-licences', 'cms:container-boot', 'cms:network-scope' ],
      routes: [ 'POST /.databox/cms/org-apps/profile/build', 'POST /.databox/cms/org-apps/licence/issue', 'POST /.databox/cms/org-apps/licence/validate', 'POST /.databox/cms/org-apps/boot', 'POST /.databox/cms/org-apps/network-scope/check' ],
      configShape: `${CMS.namespace}OrgAppsConfigShape`,
      navLabel: 'Org Apps',
      path: '/org-apps',
    },
    'barcode': {
      name: 'Barcode / QR Scanner',
      description: 'GS1-aware barcode and QR code scanning. Parses GS1 application identifiers (AI), validates GTIN check digits, detects symbology (EAN/UPC/Code-128/Code-39/QR/DataMatrix), and looks up products by GTIN in the catalogue.',
      capabilities: [ 'cms:barcode', 'cms:gs1', 'cms:gtin', 'cms:product-lookup' ],
      routes: [ 'POST /.databox/cms/barcode/scan', 'POST /.databox/cms/barcode/lookup' ],
      configShape: `${CMS.namespace}BarcodeConfigShape`,
      navLabel: 'Barcode Scanner',
      path: '/barcode',
    },
    'eftpos': {
      name: 'EFTPOS / Card Reader',
      description: 'EFTPOS terminal integration for card payments. Supports multiple providers (Tyro, Linkly, Westpac, CBA, NAB, ANZ, Stripe Terminal, Square Terminal, Sumup) via IPG/REST/SOAP/HID/SERIAL protocols. Handles purchase, refund, cashout, preauth, void, and settlement transactions.',
      capabilities: [ 'cms:eftpos', 'cms:card-payment', 'cms:terminal-integration', 'cms:settlement' ],
      routes: [ 'POST /.databox/cms/eftpos/transaction', 'POST /.databox/cms/eftpos/settlement', 'POST /.databox/cms/eftpos/status' ],
      configShape: `${CMS.namespace}EftposConfigShape`,
      navLabel: 'EFTPOS Terminal',
      path: '/eftpos',
    },
    'backups': {
      name: 'Password-Protected Backups',
      description: 'AES-256-GCM encrypted backups of CMS resources with scrypt key derivation. Supports JSON-LD, Turtle, and N-Quads formats. Password-protected with manifest generation for audit trails.',
      capabilities: [ 'cms:backups', 'cms:encrypted-backup', 'cms:restore', 'cms:backup-manifest' ],
      routes: [ 'POST /.databox/cms/backups/create', 'POST /.databox/cms/backups/restore', 'POST /.databox/cms/backups/manifest' ],
      configShape: `${CMS.namespace}BackupConfigShape`,
      navLabel: 'Backups',
      path: '/backups',
    },
    'accounting': {
      name: 'Accounting Import / Export',
      description: 'Bridge to leading accounting packages (Xero, MYOB, QuickBooks, Sage) with CSV, OFX, QIF, and JSON-LD format support. Exports invoices, payments, journal entries, tax summaries, contacts, and items. Imports chart of accounts, contacts, items, and opening balances.',
      capabilities: [ 'cms:accounting', 'cms:accounting-export', 'cms:accounting-import', 'cms:chart-of-accounts' ],
      routes: [ 'POST /.databox/cms/accounting/export', 'POST /.databox/cms/accounting/import' ],
      configShape: `${CMS.namespace}AccountingConfigShape`,
      navLabel: 'Accounting',
      path: '/accounting',
    },
  };

  for (const [ id, mod ] of Object.entries(newModules)) {
    if (!registry.get(id)) {
      registry.register({
        id,
        name: mod.name,
        version: '0.1.0',
        description: mod.description,
        capabilities: mod.capabilities,
        routes: mod.routes,
        configShape: mod.configShape,
        adminUi: {
          navLabel: mod.navLabel,
          path: mod.path,
        },
      });
    }
    if (!registry.isEnabled(id)) {
      registry.setEnabled(id, true);
    }
  }
}
