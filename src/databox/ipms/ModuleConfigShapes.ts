import { IPMS } from '../../util/Vocabularies';

const UI = 'http://www.w3.org/ns/ui#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const CMS_NS = IPMS.namespace;

interface ShapeTemplate {
  readonly shapeIri: string;
  readonly turtle: string;
}

function textInput(label: string, property: string, required = false, placeholder?: string): string {
  const parts = [
    `    ui:label "${label}" ;`,
    `    ui:property "${property}" ;`,
    required ? `    ui:required true ;` : '',
    placeholder ? `    ui:placeholder "${placeholder}" ;` : '',
  ].filter(Boolean);
  return `[ a ui:TextInput ;\n${parts.join('\n')}\n  ]`;
}

function booleanField(label: string, property: string, defaultValue = false): string {
  return `[ a ui:Boolean ;
    ui:label "${label}" ;
    ui:property "${property}" ;
    ui:default "${defaultValue}"^^xsd:boolean
  ]`;
}

function choiceField(label: string, property: string, options: string[]): string {
  const opts = options.map(o => `"${o}"`).join(', ');
  return `[ a ui:Choice ;
    ui:label "${label}" ;
    ui:property "${property}" ;
    ui:from ( ${opts} )
  ]`;
}

function numberField(label: string, property: string, min?: number, max?: number): string {
  const parts = [
    `    ui:label "${label}" ;`,
    `    ui:property "${property}" ;`,
    min === undefined ? '' : `    ui:min ${min} ;`,
    max === undefined ? '' : `    ui:max ${max} ;`,
  ].filter(Boolean);
  return `[ a ui:Number ;\n${parts.join('\n')}\n  ]`;
}

function textArea(label: string, property: string, placeholder?: string): string {
  const parts = [
    `    ui:label "${label}" ;`,
    `    ui:property "${property}" ;`,
    placeholder ? `    ui:placeholder "${placeholder}" ;` : '',
  ].filter(Boolean);
  return `[ a ui:TextArea ;\n${parts.join('\n')}\n  ]`;
}

function buildForm(shapeIri: string, label: string, comment: string, fields: string[]): string {
  const partsList = fields.map(f => `    ${f}`).join(' ;\n');
  return `@prefix ui: <${UI}> .
@prefix rdf: <${RDF}> .
@prefix rdfs: <${RDFS}> .
@prefix xsd: <${XSD}> .

<${shapeIri}> a ui:Form ;
  rdfs:label "${label}" ;
  rdfs:comment "${comment}" ;
  ui:parts (
${partsList}
  ) .
`;
}

const shapes: Record<string, ShapeTemplate> = {
  [`${CMS_NS}BookingsConfigShape`]: {
    shapeIri: `${CMS_NS}BookingsConfigShape`,
    turtle: buildForm(
      `${CMS_NS}BookingsConfigShape`,
      'Bookings Configuration',
      'Configure booking slot availability and reservation settings.',
      [
        numberField('Slot duration (minutes)', 'ipms:slotDurationMinutes', 15, 480),
        numberField('Max party size', 'ipms:maxPartySize', 1, 100),
        textInput('Advance booking days', 'ipms:advanceBookingDays', true, '7'),
        booleanField('Require deposit', 'ipms:requireDeposit'),
      ],
    ),
  },
  [`${CMS_NS}JobsConfigShape`]: {
    shapeIri: `${CMS_NS}JobsConfigShape`,
    turtle: buildForm(
      `${CMS_NS}JobsConfigShape`,
      'Jobs Configuration',
      'Configure production workflow stages and job queue settings.',
      [
        choiceField('Default workflow stage', 'ipms:defaultStage', [ 'intake', 'queue', 'produce', 'finish', 'ready' ]),
        booleanField('Auto-advance on completion', 'ipms:autoAdvance'),
        numberField('Max concurrent jobs', 'ipms:maxConcurrent', 1, 100),
      ],
    ),
  },
  [`${CMS_NS}PaymentsConfigShape`]: {
    shapeIri: `${CMS_NS}PaymentsConfigShape`,
    turtle: buildForm(
      `${CMS_NS}PaymentsConfigShape`,
      'Payments Configuration',
      'Configure payment processing, tax rates, and receipt settings.',
      [
        textInput('Currency code', 'ipms:currency', true, 'AUD'),
        textInput('Tax rate (%)', 'ipms:taxRate', true, '10'),
        booleanField('Tax inclusive pricing', 'ipms:taxInclusive'),
        booleanField('Allow split payments', 'ipms:allowSplit'),
        textInput('Stripe API key', 'ipms:stripeApiKey', false, 'sk_...'),
      ],
    ),
  },
  [`${CMS_NS}MenuConfigShape`]: {
    shapeIri: `${CMS_NS}MenuConfigShape`,
    turtle: buildForm(
      `${CMS_NS}MenuConfigShape`,
      'Menu Configuration',
      'Configure menu display and availability settings.',
      [
        booleanField('Show prices', 'ipms:showPrices', true),
        booleanField('Show allergen info', 'ipms:showAllergens', true),
        choiceField('Menu sort order', 'ipms:sortOrder', [ 'category', 'price-asc', 'price-desc', 'name' ]),
        textInput('Default currency', 'ipms:currency', false, 'AUD'),
      ],
    ),
  },
  [`${CMS_NS}PosOrderingConfigShape`]: {
    shapeIri: `${CMS_NS}PosOrderingConfigShape`,
    turtle: buildForm(
      `${CMS_NS}PosOrderingConfigShape`,
      'POS Terminal Configuration',
      'Configure point-of-sale terminal behavior and order settings.',
      [
        textInput('Default table number', 'ipms:defaultTable', false, '1'),
        booleanField('Require staff review for customer orders', 'ipms:requireStaffReview'),
        booleanField('Auto-print to kitchen', 'ipms:autoPrintKitchen'),
        numberField('Order timeout (minutes)', 'ipms:orderTimeoutMinutes', 1, 120),
      ],
    ),
  },
  [`${CMS_NS}TaxConfigShape`]: {
    shapeIri: `${CMS_NS}TaxConfigShape`,
    turtle: buildForm(
      `${CMS_NS}TaxConfigShape`,
      'Tax Configuration',
      'Configure tax codes, rates, and exemption handling.',
      [
        choiceField('Tax type', 'ipms:taxType', [ 'GST', 'VAT', 'Sales Tax' ]),
        textInput('Default tax rate (%)', 'ipms:defaultRate', true, '10'),
        booleanField('Tax inclusive by default', 'ipms:taxInclusiveDefault'),
        booleanField('Allow tax exemptions', 'ipms:allowExemptions'),
      ],
    ),
  },
  [`${CMS_NS}DiscountsConfigShape`]: {
    shapeIri: `${CMS_NS}DiscountsConfigShape`,
    turtle: buildForm(
      `${CMS_NS}DiscountsConfigShape`,
      'Discounts Configuration',
      'Configure discount codes, stacking rules, and promotion settings.',
      [
        booleanField('Allow discount stacking', 'ipms:allowStacking'),
        numberField('Max stack depth', 'ipms:maxStackDepth', 1, 10),
        booleanField('Member-only discounts', 'ipms:memberOnly'),
        numberField('Default promo code length', 'ipms:promoCodeLength', 4, 20),
      ],
    ),
  },
  [`${CMS_NS}NotificationsConfigShape`]: {
    shapeIri: `${CMS_NS}NotificationsConfigShape`,
    turtle: buildForm(
      `${CMS_NS}NotificationsConfigShape`,
      'Notifications Configuration',
      'Configure notification channels, priorities, and dispatch rules.',
      [
        booleanField('Enable email channel', 'ipms:enableEmail', true),
        booleanField('Enable SMS channel', 'ipms:enableSms'),
        booleanField('Enable push channel', 'ipms:enablePush'),
        booleanField('Enable LDN channel', 'ipms:enableLdn'),
        choiceField('Default priority', 'ipms:defaultPriority', [ 'low', 'normal', 'high', 'urgent' ]),
      ],
    ),
  },
  [`${CMS_NS}WebsiteSeoConfigShape`]: {
    shapeIri: `${CMS_NS}WebsiteSeoConfigShape`,
    turtle: buildForm(
      `${CMS_NS}WebsiteSeoConfigShape`,
      'Website SEO Configuration',
      'Configure public website rendering and SEO settings.',
      [
        textInput('Site title', 'ipms:siteTitle', true, 'My Business'),
        textArea('Meta description', 'ipms:metaDescription', 'Brief description for search engines'),
        booleanField('Generate sitemap', 'ipms:generateSitemap', true),
        booleanField('Include JSON-LD', 'ipms:includeJsonLd', true),
      ],
    ),
  },
  [`${CMS_NS}AllergyProfileConfigShape`]: {
    shapeIri: `${CMS_NS}AllergyProfileConfigShape`,
    turtle: buildForm(
      `${CMS_NS}AllergyProfileConfigShape`,
      'Allergy Safety Configuration',
      'Configure allergen categories, disclosure rules, and matching behavior.',
      [
        choiceField('Allergen standard', 'ipms:allergenStandard', [ 'FSANZ', 'EU', 'FDA' ]),
        booleanField('Require ingredient declarations', 'ipms:requireDeclarations'),
        booleanField('Allow selective disclosure', 'ipms:allowSelectiveDisclosure'),
        booleanField('Show allergen warnings on menu', 'ipms:showWarnings', true),
      ],
    ),
  },
  [`${CMS_NS}OrgAppsConfigShape`]: {
    shapeIri: `${CMS_NS}OrgAppsConfigShape`,
    turtle: buildForm(
      `${CMS_NS}OrgAppsConfigShape`,
      'Org Apps Configuration',
      'Configure WASM app container delivery, licensing, and network scope.',
      [
        textInput('Apps base URL', 'ipms:appsBaseUrl', true, 'https://databox.example.org/apps/'),
        booleanField('Allow remote-capable apps', 'ipms:allowRemote'),
        booleanField('Require per-install licence', 'ipms:requireLicence', true),
        textInput('Default licence scope', 'ipms:defaultLicenceScope', false, 'full'),
        textArea('Local network CIDR ranges', 'ipms:localNetworks', '192.168.1.0/24, 10.0.0.0/16'),
      ],
    ),
  },
};

export function getConfigShape(shapeIri: string): string | undefined {
  return shapes[shapeIri]?.turtle;
}

export function hasConfigShape(shapeIri: string): boolean {
  return shapeIri in shapes;
}

export function listConfigShapeIris(): string[] {
  return Object.keys(shapes);
}
