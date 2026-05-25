// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { config } from 'dotenv';
import { resolve } from 'path';

export default function setup(): void {
  config({ path: resolve(__dirname, '../../../../.env') });
}
