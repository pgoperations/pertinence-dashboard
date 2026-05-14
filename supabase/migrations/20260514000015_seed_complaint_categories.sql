-- Migration 015: seed canonical complaint_categories + complaint_aliases for
-- Customer Support ingest.
--
-- Sourced from data/canonical_mappings_customer_support_draft.md,
-- supervisor-approved 2026-05-14 with the following decisions:
--   1. Authorisation — UK spelling.
--   2. Change of Plot vs Change of Plot Size — kept separate (no answer
--      returned; defaulting to the proposal that flagged them as conceptually
--      distinct: which plot vs. how much area).
--   3. OneApp Complaint vs Realvest App Complaint — kept separate.
--   4. "Special Request — Documents" canonical name — accepted as-is.
--   5. Birthday Messages — part of CS communications; kept as a canonical.
--   6. The long-tail single-occurrence values (Default, Default Waiver,
--      Downtime, ETRAC, Farmwey, Edificio) — supervisor wants each as its own
--      canonical, not dropped.
--   7. Nothing additional that the dump missed.
--
-- Final canonical count: 60. The composite cells (e.g. "Documentaion, Site
-- Allocation") are split at ingest into individual parts that each look up
-- against this alias list, so composites don't need their own entries.
--
-- Idempotency: same shape as migration 009 — canonicals on `name` conflict,
-- aliases on `lower(alias)` conflict via the unique expression index in
-- migration 002.
--
-- Whitespace handling: aliases are stored trimmed (the ingest's lookup also
-- trims), so trailing/leading-whitespace source-cell variants do not need
-- their own alias rows. Double-space variants (e.g. "New  Contract") DO
-- need their own alias because trim() doesn't collapse internal whitespace.


-- ============================================================================
-- CANONICALS (60)
-- ============================================================================
insert into public.complaint_categories (name) values
  -- Typo-cluster canonicals (11)
  ('Documentation'),
  ('General Enquiry'),
  ('Audit'),
  ('Special Task'),
  ('Refund'),
  ('Commission Payout'),
  ('Follow-Up'),
  ('Authorisation'),
  ('Further Payment on Property'),
  ('Product Pricing Complaint'),
  ('Collection of Document / Receipt'),

  -- Distinct complaint canonicals (39)
  ('Site Allocation'),
  ('Allocation Letter'),
  ('Payment Approval Delays'),
  ('Delayed Investment and Commission Payout'),
  ('Conversion to Land'),
  ('Change of Ownership'),
  ('Delay on Home Delivery'),
  ('Escalated Legal Matters'),
  ('Semi-finished Delivery'),
  ('Termination and Movement'),
  ('Site Inspection'),
  ('Scheduled Meeting'),
  ('Change of Location'),
  ('Account Reconciliation'),
  ('OneApp Complaint'),
  ('Realvest App Complaint'),
  ('Zoho'),
  ('Technical issues'),
  ('New Client Generated'),
  ('Change of Name'),
  ('Change of Email Address'),
  ('Change of Plot'),
  ('Change of Plot Size'),
  ('Site Updates'),
  ('Proof of Payment for Receipt Processing'),
  ('Merging of Accounts'),
  ('Delayed or No Communication'),
  ('Misplaced Document'),
  ('Extension'),
  ('Birthday Messages'),
  ('Theft'),
  ('New Account Details'),
  ('Resale'),
  ('New Contract'),
  ('Contract of Sale Letter / Document'),
  ('Thank You Email'),
  ('Lack of Development'),
  ('Realtorship'),
  ('Waiver'),
  ('Site Issues / Complaint'),

  -- Special Request family (3)
  ('Special Request — Documents'),
  ('Special Request — Change of Name/Email/Location'),
  ('Special Request'),

  -- Long-tail singletons promoted to canonicals (6) — supervisor decision #6
  ('Default'),
  ('Default Waiver'),
  ('Downtime'),
  ('ETRAC'),
  ('Farmwey'),
  ('Edificio')
on conflict (name) do nothing;


-- ============================================================================
-- ALIASES
-- Each row pairs a canonical name with the EXACT raw value (case-preserved)
-- that should map to it. Lookup is case-insensitive via lower(alias).
-- ============================================================================
insert into public.complaint_aliases (complaint_category_id, alias)
select cc.id, v.alias
from (values
  -- Typo clusters
  ('Documentation',                              'Documentation'),
  ('Documentation',                              'Documentaion'),
  ('General Enquiry',                            'General Enquiry'),
  ('General Enquiry',                            'General enquiries'),
  ('General Enquiry',                            'Enquirires'),
  ('General Enquiry',                            'Enquiry about plot status'),
  ('Audit',                                      'Adit'),
  ('Audit',                                      'Addit'),
  ('Special Task',                               'Special Task'),
  ('Special Task',                               'Special task'),
  ('Refund',                                     'Refund'),
  ('Refund',                                     'Refund of money'),
  ('Commission Payout',                          'commission/payout'),
  ('Follow-Up',                                  'Follow -Up'),
  ('Authorisation',                              'Authorisation'),
  ('Further Payment on Property',                'Futher payment on proprerty'),
  ('Product Pricing Complaint',                  'Product Pricing Complaint'),
  ('Product Pricing Complaint',                  'price Increase Complaint'),
  ('Product Pricing Complaint',                  'Price Increase Complaint'),
  ('Collection of Document / Receipt',           'Collection of document/ receipt'),
  ('Collection of Document / Receipt',           'Pick Up Of  Doucments/Recipts'),

  -- Distinct categories (each canonical's own self-alias matches the source value)
  ('Site Allocation',                            'Site Allocation'),
  ('Allocation Letter',                          'Allocation Letter'),
  ('Payment Approval Delays',                    'Payment Approval Delays'),
  ('Delayed Investment and Commission Payout',   'Delayed Investment and Commission Payout'),
  ('Conversion to Land',                         'Conversion to Land'),
  ('Change of Ownership',                        'Change of Ownership'),
  ('Delay on Home Delivery',                     'Delay on Home Delivery'),
  ('Escalated Legal Matters',                    'Escalated Legal Matters'),
  ('Semi-finished Delivery',                     'Semi-finished Delivery'),
  ('Termination and Movement',                   'Termination and Movement'),
  ('Site Inspection',                            'Site Inspection'),
  ('Scheduled Meeting',                          'Scheduled Meeting'),
  ('Change of Location',                         'Change of Location'),
  ('Change of Location',                         'Change of Location Complaint'),
  ('Account Reconciliation',                     'Account Reconciliation'),
  ('OneApp Complaint',                           'OneApp Complaint'),
  ('OneApp Complaint',                           'New client on Oneapp'),
  ('Realvest App Complaint',                     'Realvest App Complaint'),
  ('Zoho',                                       'Zoho'),
  ('Technical issues',                           'Technical issues'),
  ('New Client Generated',                       'New Client Generated'),
  ('Change of Name',                             'Change of Name'),
  ('Change of Email Address',                    'Change of Email Address'),
  ('Change of Plot',                             'Change of plot'),
  ('Change of Plot Size',                        'Change of plot size'),
  ('Site Updates',                               'Site Updates'),
  ('Proof of Payment for Receipt Processing',    'Proof of payment for receipt processing'),
  ('Merging of Accounts',                        'Merging of Accounts'),
  ('Delayed or No Communication',                'Delayed or No Communication'),
  ('Misplaced Document',                         'Misplaced Document'),
  ('Extension',                                  'Extension'),
  ('Extension',                                  'Request for extension'),
  ('Birthday Messages',                          'Birthday Messages'),
  ('Theft',                                      'Theft'),
  ('New Account Details',                        'New Account Details'),
  ('Resale',                                     'Resale'),
  ('New Contract',                               'New Contract'),
  ('New Contract',                               'New  Contract'),
  ('Contract of Sale Letter / Document',         'Contract of sale letter/document'),
  ('Thank You Email',                            'Thank you email'),
  ('Lack of Development',                        'Lack of Development'),
  ('Realtorship',                                'Realtorship'),
  ('Waiver',                                     'Waiver'),
  ('Site Issues / Complaint',                    'site issues/complaint'),

  -- Special Request family. Source cells were wrapped in literal double quotes;
  -- splitComposite strips quotes during ingest, so the aliases here are the
  -- post-split values (no surrounding quotes, internal commas preserved).
  ('Special Request — Documents',                'Special Request- Sent Payment receipts, Contract of Sale or Deed of Assignment'),
  ('Special Request — Documents',                'Special Request- Sent Payment Receipts, Contract of Sale, or Deed of Assignement'),
  ('Special Request — Change of Name/Email/Location', 'Special Request- Change of Name,  Email or Location'),
  ('Special Request — Change of Name/Email/Location', 'Special Request- Change of Email, Name, or Location'),
  ('Special Request',                            'Special Request'),

  -- Long-tail singletons promoted to canonicals
  ('Default',                                    'Default'),
  ('Default Waiver',                             'Default Waiver'),
  ('Downtime',                                   'Downtime'),
  ('ETRAC',                                      'ETRAC'),
  ('Farmwey',                                    'Farmwey'),
  ('Edificio',                                   'Edificio')
) as v(canonical, alias)
join public.complaint_categories cc on cc.name = v.canonical
on conflict (lower(alias)) do nothing;
