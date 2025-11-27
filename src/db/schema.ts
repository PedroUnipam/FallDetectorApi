import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firebaseUid: text('firebase_uid').notNull().unique(),
  email: text('email').notNull().unique(),
  cpf: text('cpf').notNull().unique(),
  name: text('name').notNull(),
  didAgreeToLGPD: integer('did_agree_to_lgpd', { mode: 'boolean' })
    .notNull()
    .$defaultFn(() => true),
  cellphone: text('cellphone').notNull(),
  expoNotificationToken: text('expo_notification_token'),
  device: text('device').unique(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const patients = sqliteTable('patients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  street: text('street').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  zipCode: text('zip_code').notNull(),
  dateOfBirth: integer('date_of_birth', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const patientCaregivers = sqliteTable(
  'patient_caregivers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    patientId: integer('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    caregiverId: integer('caregiver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    uniquePatientCaregiver: unique().on(table.patientId, table.caregiverId),
  })
);

export const usersRelations = relations(users, ({ one, many }) => ({
  patient: one(patients, {
    fields: [users.id],
    references: [patients.userId],
  }),
  patientsCaredFor: many(patientCaregivers),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  user: one(users, {
    fields: [patients.userId],
    references: [users.id],
  }),
  caregivers: many(patientCaregivers),
}));

export const patientCaregiversRelations = relations(patientCaregivers, ({ one }) => ({
  patient: one(patients, {
    fields: [patientCaregivers.patientId],
    references: [patients.id],
  }),
  caregiver: one(users, {
    fields: [patientCaregivers.caregiverId],
    references: [users.id],
  }),
}));

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: integer('date', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  type: text('type', {
    enum: ['fall_1', 'fall_2', 'fall_3', 'need_help', 'ok'],
  }).notNull(),
  patientId: integer('patient_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const eventsRelations = relations(events, ({ one }) => ({
  patient: one(users, {
    fields: [events.patientId],
    references: [users.id],
  }),
}));

export const usersEventsRelations = relations(users, ({ many }) => ({
  events: many(events),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
export type PatientCaregiver = typeof patientCaregivers.$inferSelect;
export type NewPatientCaregiver = typeof patientCaregivers.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
