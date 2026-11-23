# Difficulty review: fame and start ratings

Generated from the game code and `config/fame.json` on 22 Nov 2026. To change any fame value, edit
`config/fame.json` and run `npm run derive`; ratings and question tiers follow automatically.

## 1. Fame

| Fame | Countries |
|---|---|
| 0 famous | 35 |
| 1 mid-known | 88 |
| 2 obscure | 107 |

### Fame 0, famous (35, hand-picked)

Argentina, Australia, Austria, Belgium, Brazil, Canada, China, Denmark, Egypt, Finland, France, Germany, Greece, India, Ireland, Israel, Italy, Japan, Mexico, Netherlands, New Zealand, Norway, Poland, Portugal, Russia, Saudi Arabia, South Africa, South Korea, Spain, Sweden, Switzerland, Turkey, Ukraine, United Kingdom, United States

### Fame 1 by exception: small but well known (23)

Bahamas, Croatia, Cyprus, Estonia, Fiji, Georgia, Greenland, Iceland, Jamaica, Kuwait, Latvia, Lithuania, Luxembourg, Maldives, Malta, Monaco, Mongolia, Panama, Puerto Rico, Qatar, Slovenia, Uruguay, Vatican City

These are under 5 million people, so the size rule alone would mark them obscure. Listing them here makes them mid-known.

### Fame 1, mid-known (88, including the exceptions above)

Afghanistan, Algeria, Angola, Azerbaijan, Bahamas, Bangladesh, Belarus, Bolivia, Bulgaria, Cameroon, Chile, Colombia, Costa Rica, Croatia, Cuba, Cyprus, Czechia, DR Congo, Dominican Republic, Ecuador, El Salvador, Estonia, Ethiopia, Fiji, Georgia, Ghana, Greenland, Guatemala, Haiti, Honduras, Hong Kong, Hungary, Iceland, Indonesia, Iran, Iraq, Ivory Coast, Jamaica, Jordan, Kazakhstan, Kenya, Kuwait, Latvia, Lebanon, Libya, Lithuania, Luxembourg, Madagascar, Malaysia, Maldives, Malta, Monaco, Mongolia, Morocco, Nepal, Nicaragua, Nigeria, North Korea, Oman, Pakistan, Palestine, Panama, Paraguay, Peru, Philippines, Puerto Rico, Qatar, Romania, Senegal, Serbia, Singapore, Slovakia, Slovenia, Sri Lanka, Sudan, Syria, Taiwan, Tanzania, Thailand, Tunisia, Uganda, United Arab Emirates, Uruguay, Vatican City, Venezuela, Vietnam, Yemen, Zimbabwe

### Fame 2, obscure: hand-picked, 5 million people or more (26)

Benin, Burkina Faso, Burundi, Cambodia, Central African Republic, Chad, Guinea, Kyrgyzstan, Laos, Liberia, Malawi, Mali, Mozambique, Myanmar, Niger, Papua New Guinea, Republic of the Congo, Rwanda, Sierra Leone, Somalia, South Sudan, Tajikistan, Togo, Turkmenistan, Uzbekistan, Zambia

### Fame 2, obscure: by the under-5-million rule (81)

Albania, American Samoa, Andorra, Anguilla, Antigua and Barbuda, Armenia, Aruba, Bahrain, Barbados, Belize, Bermuda, Bhutan, Bosnia and Herzegovina, Botswana, British Virgin Islands, Brunei, Cape Verde, Cayman Islands, Comoros, Cook Islands, Curaçao, Djibouti, Dominica, Equatorial Guinea, Eritrea, Eswatini, Falkland Islands, Faroe Islands, French Polynesia, Gabon, Gambia, Grenada, Guam, Guernsey, Guinea-Bissau, Guyana, Isle of Man, Jersey, Kiribati, Kosovo, Lesotho, Liechtenstein, Marshall Islands, Mauritania, Mauritius, Micronesia, Moldova, Montenegro, Montserrat, Namibia, Nauru, New Caledonia, Niue, Norfolk Island, North Macedonia, Northern Mariana Islands, Palau, Pitcairn Islands, Saint Barthélemy, Saint Helena, Ascension and Tristan da Cunha, Saint Kitts and Nevis, Saint Lucia, Saint Martin, Saint Pierre and Miquelon, Saint Vincent and the Grenadines, Samoa, San Marino, Seychelles, Sint Maarten, Solomon Islands, Suriname, São Tomé and Príncipe, Timor-Leste, Tonga, Trinidad and Tobago, Turks and Caicos Islands, United States Virgin Islands, Vanuatu, Wallis and Futuna, Western Sahara, Åland Islands

## 2. Starts per rating

| Mode | Easy ×1 | Medium ×1.5 | Hard ×2 | Very Hard ×2.5 | Extreme ×3 |
|---|---|---|---|---|---|
| World (230) | 35 | 41 | 62 | 41 | 51 |
| Africa (56) | 2 | 10 | 25 | 13 | 6 |
| Asia (49) | 7 | 12 | 16 | 13 | 1 |
| Europe (51) | 19 | 11 | 9 | 7 | 5 |
| North America (38) | 3 | 5 | 5 | 6 | 19 |
| South America (13) | 2 | 2 | 8 | 0 | 1 |
| Oceania (23) | 2 | 0 | 0 | 1 | 20 |

## 3. World mode starts by rating

### Easy (35)

Argentina, Australia, Austria, Belgium, Brazil, Canada, China, Denmark, Egypt, Finland, France, Germany, Greece, India, Ireland, Israel, Italy, Japan, Mexico, Netherlands, New Zealand, Norway, Poland, Portugal, Russia, Saudi Arabia, South Africa, South Korea, Spain, Sweden, Switzerland, Turkey, Ukraine, United Kingdom, United States

### Medium (41)

Afghanistan, Algeria, Angola, Azerbaijan, Belarus, Bolivia, Bulgaria, Cameroon, Colombia, Costa Rica, Croatia, Czechia, DR Congo, Estonia, Ethiopia, Georgia, Guatemala, Honduras, Hungary, Indonesia, Iran, Iraq, Ivory Coast, Jordan, Kazakhstan, Latvia, Lithuania, Malaysia, Morocco, Nicaragua, Panama, Romania, Senegal, Serbia, Slovenia, Sudan, Syria, United Arab Emirates, Venezuela, Yemen, Zimbabwe

### Hard (62)

Albania, Armenia, Bangladesh, Bosnia and Herzegovina, Botswana, Central African Republic, Chad, Chile, Djibouti, Dominican Republic, Ecuador, El Salvador, Equatorial Guinea, Eritrea, Gabon, Ghana, Guinea, Guyana, Haiti, Hong Kong, Kenya, Kosovo, Kuwait, Lebanon, Libya, Luxembourg, Mali, Mauritania, Monaco, Mongolia, Montenegro, Mozambique, Namibia, Nepal, Nigeria, North Korea, North Macedonia, Oman, Pakistan, Palestine, Paraguay, Peru, Qatar, Republic of the Congo, Saint Martin, Sierra Leone, Sint Maarten, Slovakia, Somalia, South Sudan, Suriname, Tajikistan, Tanzania, Thailand, Tunisia, Uganda, Uruguay, Uzbekistan, Vatican City, Vietnam, Western Sahara, Zambia

### Very Hard (41)

Andorra, Bahamas, Belize, Benin, Bhutan, Brunei, Burkina Faso, Burundi, Cambodia, Cuba, Cyprus, Eswatini, Fiji, Gambia, Greenland, Guinea-Bissau, Iceland, Jamaica, Kyrgyzstan, Laos, Lesotho, Liberia, Liechtenstein, Madagascar, Malawi, Maldives, Malta, Moldova, Myanmar, Niger, Papua New Guinea, Philippines, Puerto Rico, Rwanda, San Marino, Singapore, Sri Lanka, Taiwan, Timor-Leste, Togo, Turkmenistan

### Extreme (52)

American Samoa, Anguilla, Antigua and Barbuda, Aruba, Bahrain, Barbados, Bermuda, British Virgin Islands, Cape Verde, Cayman Islands, Comoros, Cook Islands, Curaçao, Dominica, Falkland Islands, Faroe Islands, French Polynesia, Grenada, Guam, Guernsey, Isle of Man, Jersey, Kiribati, Marshall Islands, Mauritius, Micronesia, Montserrat, Nauru, New Caledonia, Niue, Norfolk Island, Northern Mariana Islands, Palau, Pitcairn Islands, Saint Barthélemy, Saint Helena, Ascension and Tristan da Cunha, Saint Kitts and Nevis, Saint Lucia, Saint Pierre and Miquelon, Saint Vincent and the Grenadines, Samoa, Seychelles, Solomon Islands, São Tomé and Príncipe, Tonga, Trinidad and Tobago, Turks and Caicos Islands, United States Virgin Islands, Vanuatu, Wallis and Futuna, Åland Islands

## 4. What changed in the last pass

Twenty small but well-known countries were moved from obscure to mid-known, which lowered each by two rating steps:

| Country | Was | Now |
|---|---|---|
| Luxembourg, Monaco, Qatar, Kuwait, Uruguay, Mongolia | Very Hard | Hard |
| Malta, Cyprus, Bahamas, Fiji, Maldives, Puerto Rico, Greenland | Extreme | Very Hard |
| Croatia, Slovenia, Estonia, Latvia, Lithuania, Georgia, Panama | Hard | Medium |

## 5. Ratings that may still look odd

- **Famous countries with poor positions are Easy.** Canada, the United States, Portugal, Ireland,
  South Korea, the Netherlands and Denmark are boxed in, and Japan, Australia and New Zealand are
  islands. All are Easy because the table makes fame 0 Easy everywhere.
- **Oceania still has almost no middle:** Australia and New Zealand are Easy, Fiji is Very Hard, the
  other 20 are Extreme.
- **Hard mixes two different situations:** mid-known countries with no cheap neighbour (Thailand,
  Vietnam, Nigeria, Pakistan, Peru, Chile, and now Luxembourg, Monaco, Qatar, Kuwait, Uruguay) and
  obscure countries with an easy way out (Kosovo, Gabon, Djibouti).
- **Still obscure, arguably familiar:** Bahrain, Barbados, Bermuda, Trinidad and Tobago, Albania,
  Armenia, Bosnia and Herzegovina, Botswana, Namibia. I left these where the size rule put them; add
  any of them to the `familiar` list if you disagree.
- **Papua New Guinea, Timor-Leste and Brunei are Very Hard rather than Extreme** because each has one
  land border, although they play much like islands.
