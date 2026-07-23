-- Records which language a visitor was using at the moment they signed up
-- — informational only (for future segmented outreach), never used to
-- gate or alter the signup flow itself.
alter table email_signups
  add column signup_locale text;
