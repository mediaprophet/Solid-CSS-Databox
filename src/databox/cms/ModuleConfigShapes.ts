import { CMS } from '../../util/Vocabularies';

const UI = 'http://www.w3.org/ns/ui#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const CMS_NS = CMS.namespace;

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
  const opts = options.map((o) => `"${o}"`).join(', ');
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
    min !== undefined ? `    ui:min ${min} ;` : '',
    max !== undefined ? `    ui:max ${max} ;` : '',
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
  const partsList = fields.map((f) => `    ${f}`).join(' ;\n');
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
        numberField('Slot duration (minutes)', 'cms:slotDurationMinutes', 15, 480),
        numberField('Max party size', 'cms:maxPartySize', 1, 100),
        textInput('Advance booking days', 'cms:advanceBookingDays', true, '7'),
        booleanField('Require deposit', 'cms:requireDeposit'),
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
        choiceField('Default workflow stage', 'cms:defaultStage', [ 'intake', 'queue', 'produce', 'finish', 'ready' ]),
        booleanField('Auto-advance on completion', 'cms:autoAdvance'),
        numberField('Max concurrent jobs', 'cms:maxConcurrent', 1, 100),
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
        textInput('Currency code', 'cms:currency', true, 'AUD'),
        textInput('Tax rate (%)', 'cms:taxRate', true, '10'),
        booleanField('Tax inclusive pricing', 'cms:taxInclusive'),
        booleanField('Allow split payments', 'cms:allowSplit'),
        textInput('Stripe API key', 'cms:stripeApiKey', false, 'sk_...'),
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
        booleanField('Show prices', 'cms:showPrices', true),
        booleanField('Show allergen info', 'cms:showAllergens', true),
        choiceField('Menu sort order', 'cms:sortOrder', [ 'category', 'price-asc', 'price-desc', 'name' ]),
        textInput('Default currency', 'cms:currency', false, 'AUD'),
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
        textInput('Default table number', 'cms:defaultTable', false, '1'),
        booleanField('Require staff review for customer orders', 'cms:requireStaffReview'),
        booleanField('Auto-print to kitchen', 'cms:autoPrintKitchen'),
        numberField('Order timeout (minutes)', 'cms:orderTimeoutMinutes', 1, 120),
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
        choiceField('Tax type', 'cms:taxType', [ 'GST', 'VAT', 'Sales Tax' ]),
        textInput('Default tax rate (%)', 'cms:defaultRate', true, '10'),
        booleanField('Tax inclusive by default', 'cms:taxInclusiveDefault'),
        booleanField('Allow tax exemptions', 'cms:allowExemptions'),
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
        booleanField('Allow discount stacking', 'cms:allowStacking'),
        numberField('Max stack depth', 'cms:maxStackDepth', 1, 10),
        booleanField('Member-only discounts', 'cms:memberOnly'),
        numberField('Default promo code length', 'cms:promoCodeLength', 4, 20),
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
        booleanField('Enable email channel', 'cms:enableEmail', true),
        booleanField('Enable SMS channel', 'cms:enableSms'),
        booleanField('Enable push channel', 'cms:enablePush'),
        booleanField('Enable LDN channel', 'cms:enableLdn'),
        choiceField('Default priority', 'cms:defaultPriority', [ 'low', 'normal', 'high', 'urgent' ]),
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
        textInput('Site title', 'cms:siteTitle', true, 'My Business'),
        textArea('Meta description', 'cms:metaDescription', 'Brief description for search engines'),
        booleanField('Generate sitemap', 'cms:generateSitemap', true),
        booleanField('Include JSON-LD', 'cms:includeJsonLd', true),
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
        choiceField('Allergen standard', 'cms:allergenStandard', [ 'FSANZ', 'EU', 'FDA' ]),
        booleanField('Require ingredient declarations', 'cms:requireDeclarations'),
        booleanField('Allow selective disclosure', 'cms:allowSelectiveDisclosure'),
        booleanField('Show allergen warnings on menu', 'cms:showWarnings', true),
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
        textInput('Apps base URL', 'cms:appsBaseUrl', true, 'https://databox.example.org/apps/'),
        booleanField('Allow remote-capable apps', 'cms:allowRemote'),
        booleanField('Require per-install licence', 'cms:requireLicence', true),
        textInput('Default licence scope', 'cms:defaultLicenceScope', false, 'full'),
        textArea('Local network CIDR ranges', 'cms:localNetworks', '192.168.1.0/24, 10.0.0.0/16'),
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
