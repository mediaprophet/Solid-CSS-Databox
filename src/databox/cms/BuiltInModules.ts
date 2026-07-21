import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
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
      routes: [ 'POST /.databox/cms/hosting/plan' ],
      adminUi: {
        navLabel: 'Hosting',
        path: '/hosting',
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
}
