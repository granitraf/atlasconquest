# New questions review

The four themes added on top of the existing questions: **national sport**, **main export**, **year of independence** and **famous person**. Everything here was written from memory, not looked up, so treat it as a first draft for you to check.

- Sports, exports and people are curated facts in `public/data/facts.json`. Years are in `config/independence.json` (run `npm run derive` after editing).
- **unsure** marks an entry a reasonable person might dispute. They are all listed first, with the reason.
- Then each theme: what is asked, and every country that is skipped, with the reason.

| Theme | Countries asked | Skipped | Marked unsure |
|---|---|---|---|
| National sport | 45 | 185 | 1 |
| Main export | 114 | 116 | 35 |
| Year of independence | 150 | 80 | 28 |
| Famous person | 50 | 180 | 0 |

## Entries to double-check

### Main export (35)

The top export of a country moves with prices. Where two or three goods are close, the others are listed as "never offered": they cannot appear as wrong options.

| Country | Answer | Never offered as wrong | Why it is flagged |
|---|---|---|---|
| Armenia | Copper | Gold | Copper ore is the long-standing answer; gold re-exports have overtaken it since 2022. |
| Belarus | Potash | Refined petroleum | Potash fertiliser is the long-standing answer; refined petroleum leads in some years, and figures are thin since sanctions. |
| Bolivia | Natural gas | Gold | Gas exports have been falling; gold and zinc overtook them in some recent years. |
| Burundi | Coffee | Gold, Tea | Coffee is the traditional answer; gold tops some recent figures. |
| Cambodia | Clothing | – | Clothing has led for years; flagged only because trade figures shift. |
| Comoros | Cloves | Vanilla | Cloves lead in most years; vanilla and ylang-ylang follow. |
| Fiji | Bottled water | Fish, Gold | Bottled water leads in recent years; sugar, fish and gold follow. |
| France | Aircraft | Cars, Pharmaceuticals | Aircraft lead in most years; medicines and cars are close. |
| Grenada | Nutmeg | Fish | Nutmeg is the famous answer; fish is larger in some years. |
| Haiti | Clothing | – | Clothing has led for years; flagged only because trade figures shift. |
| Honduras | Coffee | Clothing | Coffee leads among goods grown or made there; clothing assembly is larger in some figures. |
| Iceland | Aluminium | Fish | Aluminium and fish trade places. |
| Kenya | Tea | Coffee | Tea leads; cut flowers and coffee follow. |
| Laos | Electricity | Copper, Gold | Electricity sold to Thailand leads in most years; copper and gold are close. |
| Liberia | Iron ore | Gold | Iron ore, gold and rubber trade places. |
| Madagascar | Vanilla | Clothing | Vanilla is the famous answer; nickel and clothing lead in some years. |
| Malaysia | Electronics | Semiconductors, Crude oil, Natural gas | Electronics (integrated circuits) lead; petroleum and palm oil follow. |
| Mauritania | Iron ore | Gold, Fish | Iron ore, gold and fish trade places from year to year. |
| Namibia | Diamonds | Gold, Fish, Uranium | Diamonds lead in most years; uranium, gold and fish are close. |
| Niger | Uranium | Gold, Crude oil | Uranium is the long-standing answer; gold rivals it, and crude oil since 2024. |
| Paraguay | Soybeans | Electricity, Beef | Soybeans lead in most years; electricity from the Itaipú dam and beef are close. |
| Peru | Copper | Gold | Copper leads; gold is a close second. |
| Singapore | Semiconductors | Electronics, Refined petroleum | Integrated circuits and refined petroleum trade places. |
| Somalia | Livestock | Gold | Livestock is the traditional answer; gold re-exports top some recent figures. |
| South Korea | Semiconductors | Cars, Electronics | Semiconductors lead in most years; cars and refined petroleum are close. |
| Spain | Cars | Refined petroleum, Pharmaceuticals | Cars lead narrowly over refined petroleum and medicines. |
| Sudan | Gold | Crude oil, Livestock | Gold leads since the loss of the southern oilfields; figures are unreliable since 2023. |
| Switzerland | Pharmaceuticals | Gold | Gold tops the raw trade figures because it is traded through Switzerland; medicines lead among goods made there. |
| Tanzania | Gold | Cashew nuts | Gold leads; cashew nuts and other crops follow. |
| Trinidad and Tobago | Natural gas | – | Gas, ammonia and oil products: which leads depends on how they are classified. |
| Uganda | Coffee | Gold | Coffee is the traditional answer; gold re-exports top some recent figures. |
| Ukraine | Sunflower oil | Iron ore | Sunflower oil, maize and wheat trade places; iron ore and steel led before 2022. |
| Uruguay | Beef | Soybeans | Beef leads in most years; soybeans and wood pulp are close. |
| Vietnam | Electronics | Clothing | Phones and electronics lead; clothing is second. |
| Zimbabwe | Gold | Tobacco | Gold and tobacco trade places. |

### Year of independence (28)

| Country | Year asked | Other years kept clear | Why it is flagged |
|---|---|---|---|
| Afghanistan | 1919 | – | Never formally colonised. 1919 is when Britain gave up control of its foreign affairs, and the date Afghanistan celebrates. |
| Armenia | 1991 | 1918 | Independence from the Soviet Union. A first republic existed from 1918 to 1920. |
| Azerbaijan | 1991 | 1918 | Independence from the Soviet Union. A first republic existed from 1918 to 1920. |
| Bulgaria | 1908 | 1878 | Full independence was declared in 1908. Self-rule came in 1878, the date of the national holiday. |
| Chile | 1818 | 1810 | Declared in 1818. Chile celebrates 1810, when its first government was formed. |
| Colombia | 1810 | 1819 | The date Colombia celebrates. Independence was secured in 1819. |
| Cuba | 1902 | 1898 | The republic. Spanish rule ended in 1898, followed by American occupation. |
| Czechia | 1993 | 1918 | The split of Czechoslovakia. Czechoslovakia itself dates from 1918. |
| Egypt | 1922 | 1952 | Britain declared Egypt independent in 1922 but kept troops there; the republic dates from 1952–53. |
| Estonia | 1918 | 1991 | First independence. Restored in 1991, which many players will think of first. |
| Georgia | 1991 | 1918 | Independence from the Soviet Union. A first republic existed from 1918 to 1921. |
| Greece | 1821 | 1830, 1832 | The start of the war of independence and the date Greece celebrates. Recognised in 1830. |
| Iceland | 1944 | 1918 | The republic. Iceland was already a sovereign kingdom under the Danish crown from 1918. |
| Iraq | 1932 | – | End of the British mandate. The monarchy fell in 1958, which some count instead. |
| Kosovo | 2008 | – | Declared in 2008. Not recognised by every country. |
| Latvia | 1918 | 1991 | First independence. Restored in 1991, which many players will think of first. |
| Lithuania | 1918 | 1990 | First independence. Restored in 1990, which many players will think of first. |
| Marshall Islands | 1986 | – | The end of American trusteeship under a compact of free association. |
| Mexico | 1821 | 1810 | Independence was won in 1821. Mexico celebrates 1810, when the war began. |
| Micronesia | 1986 | – | The end of American trusteeship under a compact of free association. |
| Norway | 1905 | 1814 | The end of the union with Sweden. The constitution dates from 1814. |
| Palau | 1994 | – | The end of American trusteeship under a compact of free association. |
| Panama | 1903 | 1821 | Separation from Colombia. Independence from Spain came in 1821. |
| Philippines | 1946 | 1898 | Independence from the United States. The Philippines celebrates the 1898 declaration against Spain. |
| Poland | 1918 | – | Independence regained after 123 years of partition; Poland was a state long before. |
| Romania | 1877 | 1878 | Declared in 1877, recognised in 1878: one year apart, so the other year can never be an option. |
| Tanzania | 1961 | 1964 | Tanganyika, the mainland. Zanzibar followed in 1963 and the union dates from 1964. |
| Tonga | 1970 | – | Never formally colonised: a British protected state until 1970. |

### National sport (1)

| Country | Answer | Why it is flagged |
|---|---|---|
| Uzbekistan | Kurash | Widely described as the national sport; I could not confirm an official declaration. |

### Famous person

No person who is asked is marked unsure. One who is no longer asked still carries the mark:

- Grenada: Kirani James. The fact is right; he is rated 2, so under the new rule he is no longer asked.

## National sport

45 countries. The question is "What is the national sport of X?" (Afghanistan's is worded around buzkashi). Wrong options are hand-picked for each country from sports played in its region. A sport with a second claim is recorded and never offered as wrong. Ice and snow sports are never offered for a country closer to the equator than 35°, and football is never an option.

| Country | Answer | Also has a claim: never offered | Wrong options drawn from |
|---|---|---|---|
| Afghanistan | Buzkashi | – | Polo, Kabaddi, Wrestling, Archery |
| Antigua and Barbuda | Cricket | – | Athletics, Netball, Basketball, Sailing |
| Argentina | Pato | Polo | Rugby union, Basketball, Rodeo, Tennis |
| Austria | Alpine skiing | – | Ice hockey, Handball, Tennis, Curling |
| Bangladesh | Kabaddi | Cricket | Field hockey, Badminton, Volleyball, Wrestling |
| Barbados | Cricket | Road tennis | Athletics, Netball, Basketball, Baseball |
| Bermuda | Cricket | – | Sailing, Golf, Rugby union, Athletics |
| Bhutan | Archery | – | Wrestling, Kabaddi, Polo, Table tennis |
| Canada | Ice hockey | Lacrosse | Curling, Baseball, Basketball, Rugby union |
| Chile | Rodeo | – | Polo, Rugby union, Tennis, Basketball |
| China | Table tennis | – | Badminton, Basketball, Volleyball, Gymnastics |
| Colombia | Tejo | Cycling | Baseball, Rodeo, Basketball, Volleyball |
| Cuba | Baseball | Boxing | Basketball, Volleyball, Cricket, Athletics |
| Dominican Republic | Baseball | – | Basketball, Boxing, Cricket, Volleyball |
| Fiji | Rugby union | Rugby sevens | Cricket, Netball, Basketball, Sailing |
| Finland | Pesäpallo | Ice hockey, Cross-country skiing | Bandy, Handball, Floorball, Curling |
| Guyana | Cricket | – | Baseball, Basketball, Athletics, Boxing |
| Hungary | Water polo | – | Handball, Fencing, Ice hockey, Basketball |
| Iran | Wrestling | Polo | Weightlifting, Volleyball, Taekwondo, Archery |
| Ireland | Hurling | Gaelic football | Rugby union, Cricket, Golf, Shinty |
| Japan | Sumo | Baseball | Judo, Karate, Kendo, Table tennis |
| Kyrgyzstan | Kok-boru | – | Polo, Archery, Wrestling, Falconry |
| Malaysia | Sepak takraw | Badminton | Field hockey, Table tennis, Muay Thai, Kabaddi |
| Mexico | Charrería | Boxing | Baseball, Basketball, Polo, Volleyball |
| Mongolia | Wrestling | Archery, Horse racing | Judo, Polo, Boxing, Basketball |
| Myanmar | Chinlone | – | Muay Thai, Badminton, Kabaddi, Sepak takraw |
| Nauru | Australian rules football | Weightlifting | Rugby league, Cricket, Netball, Rugby union |
| Nepal | Volleyball | Cricket, Dandi biyo | Kabaddi, Field hockey, Badminton, Archery |
| New Zealand | Rugby union | Cricket, Netball | Basketball, Golf, Field hockey, Sailing |
| Nicaragua | Baseball | – | Boxing, Basketball, Volleyball, Rodeo |
| Norway | Cross-country skiing | Biathlon, Ski jumping | Ice hockey, Handball, Bandy, Curling |
| Pakistan | Field hockey | Cricket | Kabaddi, Squash, Polo, Wrestling |
| Papua New Guinea | Rugby league | – | Cricket, Australian rules football, Netball, Basketball |
| Philippines | Arnis | Basketball, Sepak takraw, Boxing | Badminton, Volleyball, Judo, Taekwondo |
| Samoa | Rugby union | Cricket, Kilikiti | Netball, Boxing, Volleyball, Basketball |
| Senegal | Wrestling | – | Basketball, Athletics, Boxing, Handball |
| South Korea | Taekwondo | Baseball | Judo, Archery, Karate, Table tennis |
| Sri Lanka | Volleyball | Cricket | Field hockey, Badminton, Kabaddi, Rugby union |
| Taiwan | Baseball | – | Table tennis, Badminton, Basketball, Judo |
| Thailand | Muay Thai | – | Sepak takraw, Badminton, Judo, Table tennis |
| Tonga | Rugby union | – | Netball, Boxing, Volleyball, Cricket |
| Turkey | Oil wrestling | – | Archery, Basketball, Volleyball, Weightlifting |
| United States | Baseball | American football, Basketball | Ice hockey, Golf, Boxing, Lacrosse |
| Uzbekistan | Kurash (unsure) | – | Polo, Archery, Boxing, Weightlifting |
| Venezuela | Baseball | – | Basketball, Boxing, Volleyball, Rodeo |

### Skipped (185)

Countries with a specific reason:

| Country | Reason |
|---|---|
| American Samoa | American football and rugby both have a claim. |
| Anguilla | Boat racing is official but too little known to ask. |
| Australia | Cricket, Australian rules football and rugby league all have a claim. |
| Bahamas | Sloop sailing is official but too little known to ask. |
| Brazil | Football. Capoeira is asked as a separate fact. |
| Cambodia | Bokator and Khmer boxing are traditional but too little known to ask. |
| Cook Islands | Rugby league and rugby union both have a claim. |
| Croatia | Football, handball, water polo and basketball all have a claim. |
| Czechia | Ice hockey and football both have a claim. |
| Denmark | Handball is sometimes claimed, but football is far more popular. |
| Dominica | Cricket is traditional, but football rivals it and nothing is declared. |
| Estonia | Nothing declared; basketball, football and skiing share the stage. |
| Ethiopia | Famous for distance running, which is not a national sport as such. |
| Georgia | Rugby, wrestling and lelo burti all have a claim. |
| Grenada | Cricket is traditional, but athletics and football rival it and nothing is declared. |
| Iceland | Glíma is the official one but too little known to ask; handball is the popular claim. |
| India | No official national sport (field hockey is a common myth). Cricket is asked as a separate fact. |
| Indonesia | Badminton and pencak silat both have a claim. |
| Jamaica | Cricket and athletics both have a claim. |
| Kazakhstan | Kokpar and wrestling are both claimed; nothing official. |
| Kenya | Famous for distance running, which is not a national sport as such. |
| Laos | Muay Lao and sepak takraw are both claimed; nothing clear. |
| Latvia | Ice hockey and basketball both have a claim. |
| Lithuania | Basketball is already asked as a separate, differently worded fact. |
| Montenegro | Water polo and football both have a claim. |
| North Korea | No reliable information. |
| Panama | Baseball and boxing both have a claim. |
| Peru | Paleta frontón is claimed but too little known; otherwise football. |
| Puerto Rico | Baseball, boxing and basketball all have a claim. |
| Russia | Nothing official; bandy and ice hockey are both claimed. |
| Saint Kitts and Nevis | Cricket is traditional, but football and athletics rival it and nothing is declared. |
| Saint Lucia | Cricket is traditional, but football and athletics rival it and nothing is declared. |
| Saint Vincent and the Grenadines | Cricket is traditional, but football rivals it and nothing is declared. |
| Serbia | Football, basketball, water polo and tennis all have a claim. |
| Slovakia | Ice hockey and football both have a claim. |
| Slovenia | Skiing, basketball and football all have a claim. |
| South Africa | Rugby, cricket and football all have a claim. |
| Sweden | Nothing declared; football and ice hockey share the stage. |
| Switzerland | Schwingen and Hornussen are traditional but too little known to ask. |
| Tajikistan | Gushtigiri wrestling is traditional but too little known to ask. |
| Trinidad and Tobago | Cricket and football both have a claim. |
| Turkmenistan | Horse racing and wrestling are both claimed; nothing clear. |
| United Kingdom | Football, cricket and rugby all have a claim across the home nations. Golf's Scottish origin is asked as a separate fact. |
| Uruguay | Destrezas criollas is official but too little known; otherwise football. |

**All the rest (141):** football is the most popular sport, or no sport in particular, and nothing else is officially declared or strongly identified with the country. The answer would be "football, like everywhere".

Åland Islands, Albania, Algeria, Andorra, Angola, Armenia, Aruba, Azerbaijan, Bahrain, Belarus, Belgium, Belize, Benin, Bolivia, Bosnia and Herzegovina, Botswana, British Virgin Islands, Brunei, Bulgaria, Burkina Faso, Burundi, Cameroon, Cape Verde, Cayman Islands, Central African Republic, Chad, Comoros, Costa Rica, Curaçao, Cyprus, Djibouti, DR Congo, Ecuador, Egypt, El Salvador, Equatorial Guinea, Eritrea, Eswatini, Falkland Islands, Faroe Islands, France, French Polynesia, Gabon, Gambia, Germany, Ghana, Greece, Greenland, Guam, Guatemala, Guernsey, Guinea, Guinea-Bissau, Haiti, Honduras, Hong Kong, Iraq, Isle of Man, Israel, Italy, Ivory Coast, Jersey, Jordan, Kiribati, Kosovo, Kuwait, Lebanon, Lesotho, Liberia, Libya, Liechtenstein, Luxembourg, Madagascar, Malawi, Maldives, Mali, Malta, Marshall Islands, Mauritania, Mauritius, Micronesia, Moldova, Monaco, Montserrat, Morocco, Mozambique, Namibia, Netherlands, New Caledonia, Niger, Nigeria, Niue, Norfolk Island, North Macedonia, Northern Mariana Islands, Oman, Palau, Palestine, Paraguay, Pitcairn Islands, Poland, Portugal, Qatar, Republic of the Congo, Romania, Rwanda, Saint Barthélemy, Saint Helena, Ascension and Tristan da Cunha, Saint Martin, Saint Pierre and Miquelon, San Marino, São Tomé and Príncipe, Saudi Arabia, Seychelles, Sierra Leone, Singapore, Sint Maarten, Solomon Islands, Somalia, South Sudan, Spain, Sudan, Suriname, Syria, Tanzania, Timor-Leste, Togo, Tunisia, Turks and Caicos Islands, Uganda, Ukraine, United Arab Emirates, United States Virgin Islands, Vanuatu, Vatican City, Vietnam, Wallis and Futuna, Western Sahara, Yemen, Zambia, Zimbabwe.

## Main export

114 countries. The question is "What is X's biggest export?". Wrong options are the biggest exports of other countries, nearest regions first. Related answers share a group and are never set against each other: **petroleum** (crude oil, refined petroleum, natural gas, oil and gas) and **clothing** (clothing, textiles). Each fact also lists the country's other big exports, which are never offered as wrong.

| Country | Answer | Group | Never offered as wrong |
|---|---|---|---|
| Algeria | Natural gas | petroleum | – |
| Angola | Crude oil | petroleum | – |
| Argentina | Soybeans | – | Beef |
| Armenia | Copper (unsure) | – | Gold |
| Australia | Iron ore | – | Coal, Natural gas |
| Azerbaijan | Crude oil | petroleum | – |
| Bahrain | Refined petroleum | petroleum | Aluminium |
| Bangladesh | Clothing | clothing | Textiles |
| Belarus | Potash (unsure) | – | Refined petroleum |
| Benin | Cotton | – | Cashew nuts |
| Bhutan | Electricity | – | – |
| Bolivia | Natural gas (unsure) | petroleum | Gold |
| Botswana | Diamonds | – | Copper |
| Brazil | Soybeans | – | Iron ore, Crude oil |
| Brunei | Crude oil | petroleum | – |
| Burkina Faso | Gold | – | Cotton |
| Burundi | Coffee (unsure) | – | Gold, Tea |
| Cambodia | Clothing (unsure) | clothing | – |
| Cameroon | Crude oil | petroleum | Cocoa, Timber |
| Canada | Crude oil | petroleum | Cars, Gold |
| Chad | Crude oil | petroleum | Gold, Cotton |
| Chile | Copper | – | Fish |
| China | Electronics | – | Clothing |
| Colombia | Crude oil | petroleum | Coal, Coffee |
| Comoros | Cloves (unsure) | – | Vanilla |
| Costa Rica | Medical devices | – | – |
| Czechia | Cars | – | Electronics |
| Denmark | Pharmaceuticals | – | – |
| DR Congo | Copper | – | Gold |
| Ecuador | Crude oil | petroleum | Bananas, Fish |
| Equatorial Guinea | Crude oil | petroleum | – |
| Ethiopia | Coffee | – | Gold |
| Faroe Islands | Fish | – | – |
| Fiji | Bottled water (unsure) | – | Fish, Gold |
| France | Aircraft (unsure) | – | Cars, Pharmaceuticals |
| Gabon | Crude oil | petroleum | Timber |
| Germany | Cars | – | Pharmaceuticals |
| Ghana | Gold | – | Cocoa, Crude oil |
| Greece | Refined petroleum | petroleum | Pharmaceuticals, Aluminium |
| Greenland | Fish | – | – |
| Grenada | Nutmeg (unsure) | – | Fish |
| Guinea | Bauxite | – | Gold |
| Guinea-Bissau | Cashew nuts | – | – |
| Guyana | Crude oil | petroleum | Gold |
| Haiti | Clothing (unsure) | clothing | – |
| Honduras | Coffee (unsure) | – | Clothing |
| Iceland | Aluminium (unsure) | – | Fish |
| India | Refined petroleum | petroleum | Diamonds, Pharmaceuticals |
| Indonesia | Coal | – | Natural gas, Crude oil |
| Iran | Crude oil | petroleum | – |
| Iraq | Crude oil | petroleum | – |
| Ireland | Pharmaceuticals | – | Semiconductors |
| Ivory Coast | Cocoa | – | Gold, Crude oil |
| Jamaica | Bauxite | – | – |
| Japan | Cars | – | Electronics |
| Kazakhstan | Crude oil | petroleum | Copper, Uranium |
| Kenya | Tea (unsure) | – | Coffee |
| Kiribati | Fish | – | – |
| Kuwait | Crude oil | petroleum | – |
| Kyrgyzstan | Gold | – | – |
| Laos | Electricity (unsure) | – | Copper, Gold |
| Lesotho | Clothing | clothing | Diamonds |
| Liberia | Iron ore (unsure) | – | Gold |
| Libya | Crude oil | petroleum | – |
| Madagascar | Vanilla (unsure) | – | Clothing |
| Malawi | Tobacco | – | Tea |
| Malaysia | Electronics (unsure) | – | Semiconductors, Crude oil, Natural gas |
| Maldives | Fish | – | – |
| Mali | Gold | – | Cotton |
| Mauritania | Iron ore (unsure) | – | Gold, Fish |
| Mexico | Cars | – | Crude oil, Electronics |
| Micronesia | Fish | – | – |
| Mongolia | Coal | – | Copper, Gold |
| Namibia | Diamonds (unsure) | – | Gold, Fish, Uranium |
| New Caledonia | Nickel | – | – |
| New Zealand | Dairy products | – | Beef |
| Niger | Uranium (unsure) | – | Gold, Crude oil |
| Nigeria | Crude oil | petroleum | – |
| Norway | Oil and gas | petroleum | Fish |
| Oman | Crude oil | petroleum | – |
| Pakistan | Textiles | clothing | – |
| Paraguay | Soybeans (unsure) | – | Electricity, Beef |
| Peru | Copper (unsure) | – | Gold |
| Philippines | Electronics | – | Semiconductors |
| Qatar | Natural gas | petroleum | – |
| Republic of the Congo | Crude oil | petroleum | Timber |
| Russia | Oil and gas | petroleum | Coal, Gold |
| São Tomé and Príncipe | Cocoa | – | – |
| Saudi Arabia | Crude oil | petroleum | – |
| Seychelles | Tuna | – | Fish |
| Singapore | Semiconductors (unsure) | – | Electronics, Refined petroleum |
| Slovakia | Cars | – | Electronics |
| Solomon Islands | Timber | – | – |
| Somalia | Livestock (unsure) | – | Gold |
| South Korea | Semiconductors (unsure) | – | Cars, Electronics |
| South Sudan | Crude oil | petroleum | – |
| Spain | Cars (unsure) | – | Refined petroleum, Pharmaceuticals |
| Sri Lanka | Clothing | clothing | Tea |
| Sudan | Gold (unsure) | – | Crude oil, Livestock |
| Suriname | Gold | – | Crude oil |
| Switzerland | Pharmaceuticals (unsure) | – | Gold |
| Taiwan | Semiconductors | – | Electronics |
| Tanzania | Gold (unsure) | – | Cashew nuts |
| Trinidad and Tobago | Natural gas (unsure) | petroleum | – |
| Turkmenistan | Natural gas | petroleum | – |
| Uganda | Coffee (unsure) | – | Gold |
| Ukraine | Sunflower oil (unsure) | – | Iron ore |
| United Arab Emirates | Crude oil | petroleum | – |
| Uruguay | Beef (unsure) | – | Soybeans |
| Uzbekistan | Gold | – | Cotton, Natural gas |
| Venezuela | Crude oil | petroleum | – |
| Vietnam | Electronics (unsure) | – | Clothing |
| Zambia | Copper | – | Gold |
| Zimbabwe | Gold (unsure) | – | Tobacco |

### Skipped (116)

**A diversified economy: the top export is a broad class (machinery, vehicles and parts, chemicals) or changes from year to year (32):** Albania, Austria, Belgium, Bosnia and Herzegovina, Bulgaria, Croatia, El Salvador, Estonia, Finland, Georgia, Hungary, Italy, Kosovo, Latvia, Lebanon, Lithuania, Moldova, Montenegro, Nepal, Netherlands, North Macedonia, Poland, Portugal, Romania, Serbia, Slovenia, Sweden, Thailand, Tunisia, Turkey, United Kingdom, United States.

**Two or three exports of similar size take the lead in different years (26):** Afghanistan, Belize, Central African Republic, Cuba, Dominican Republic, Egypt, Eritrea, Eswatini, Gambia, Guatemala, Israel, Jordan, Mauritius, Morocco, Mozambique, Myanmar, Nicaragua, Panama, Papua New Guinea, Rwanda, Senegal, Sierra Leone, South Africa, Tajikistan, Timor-Leste, Togo.

**No reliable trade figures (war, sanctions or isolation) (5):** North Korea, Palestine, Syria, Western Sahara, Yemen.

**A tiny economy or a territory: exports are negligible or mostly re-exports, and the economy lives on tourism, finance or aid (53):** Åland Islands, American Samoa, Andorra, Anguilla, Antigua and Barbuda, Aruba, Bahamas, Barbados, Bermuda, British Virgin Islands, Cape Verde, Cayman Islands, Cook Islands, Curaçao, Cyprus, Djibouti, Dominica, Falkland Islands, French Polynesia, Guam, Guernsey, Hong Kong, Isle of Man, Jersey, Liechtenstein, Luxembourg, Malta, Marshall Islands, Monaco, Montserrat, Nauru, Niue, Norfolk Island, Northern Mariana Islands, Palau, Pitcairn Islands, Puerto Rico, Saint Barthélemy, Saint Helena, Ascension and Tristan da Cunha, Saint Kitts and Nevis, Saint Lucia, Saint Martin, Saint Pierre and Miquelon, Saint Vincent and the Grenadines, Samoa, San Marino, Sint Maarten, Tonga, Turks and Caicos Islands, United States Virgin Islands, Vanuatu, Vatican City, Wallis and Futuna.

## Year of independence

150 countries. The question is "In which year did X gain independence?". The four options are in ascending order, 10 years apart for a year from 1900 on and 20 years apart before that, with the right year in a random position. No option is later than 2025, and none is within 5 years of another significant year for the same country.

| Country | Year | Other significant years |
|---|---|---|
| Afghanistan | 1919 (unsure) | – |
| Albania | 1912 | – |
| Algeria | 1962 | – |
| Angola | 1975 | – |
| Antigua and Barbuda | 1981 | – |
| Argentina | 1816 | 1810 |
| Armenia | 1991 (unsure) | 1918 |
| Azerbaijan | 1991 (unsure) | 1918 |
| Bahamas | 1973 | – |
| Bahrain | 1971 | – |
| Bangladesh | 1971 | – |
| Barbados | 1966 | – |
| Belarus | 1991 | – |
| Belgium | 1830 | – |
| Belize | 1981 | – |
| Benin | 1960 | – |
| Bolivia | 1825 | – |
| Bosnia and Herzegovina | 1992 | – |
| Botswana | 1966 | – |
| Brazil | 1822 | – |
| Brunei | 1984 | – |
| Bulgaria | 1908 (unsure) | 1878 |
| Burkina Faso | 1960 | – |
| Burundi | 1962 | – |
| Cambodia | 1953 | – |
| Cameroon | 1960 | – |
| Cape Verde | 1975 | – |
| Central African Republic | 1960 | – |
| Chad | 1960 | – |
| Chile | 1818 (unsure) | 1810 |
| Colombia | 1810 (unsure) | 1819 |
| Comoros | 1975 | – |
| Costa Rica | 1821 | – |
| Croatia | 1991 | – |
| Cuba | 1902 (unsure) | 1898 |
| Cyprus | 1960 | – |
| Czechia | 1993 (unsure) | 1918 |
| Djibouti | 1977 | – |
| Dominica | 1978 | – |
| DR Congo | 1960 | – |
| Egypt | 1922 (unsure) | 1952 |
| El Salvador | 1821 | – |
| Equatorial Guinea | 1968 | – |
| Eritrea | 1993 | 1991 |
| Estonia | 1918 (unsure) | 1991 |
| Eswatini | 1968 | – |
| Fiji | 1970 | – |
| Finland | 1917 | – |
| Gabon | 1960 | – |
| Gambia | 1965 | – |
| Georgia | 1991 (unsure) | 1918 |
| Ghana | 1957 | – |
| Greece | 1821 (unsure) | 1830, 1832 |
| Grenada | 1974 | – |
| Guatemala | 1821 | – |
| Guinea | 1958 | – |
| Guinea-Bissau | 1973 | 1974 |
| Guyana | 1966 | – |
| Haiti | 1804 | – |
| Honduras | 1821 | – |
| Iceland | 1944 (unsure) | 1918 |
| India | 1947 | – |
| Indonesia | 1945 | 1949 |
| Iraq | 1932 (unsure) | – |
| Israel | 1948 | – |
| Ivory Coast | 1960 | – |
| Jamaica | 1962 | – |
| Jordan | 1946 | – |
| Kazakhstan | 1991 | – |
| Kenya | 1963 | – |
| Kiribati | 1979 | – |
| Kosovo | 2008 (unsure) | – |
| Kuwait | 1961 | – |
| Kyrgyzstan | 1991 | – |
| Laos | 1953 | 1949 |
| Latvia | 1918 (unsure) | 1991 |
| Lebanon | 1943 | – |
| Lesotho | 1966 | – |
| Liberia | 1847 | – |
| Libya | 1951 | – |
| Lithuania | 1918 (unsure) | 1990 |
| Madagascar | 1960 | – |
| Malawi | 1964 | – |
| Maldives | 1965 | – |
| Mali | 1960 | – |
| Malta | 1964 | – |
| Marshall Islands | 1986 (unsure) | – |
| Mauritania | 1960 | – |
| Mauritius | 1968 | – |
| Mexico | 1821 (unsure) | 1810 |
| Micronesia | 1986 (unsure) | – |
| Moldova | 1991 | – |
| Montenegro | 2006 | – |
| Morocco | 1956 | – |
| Mozambique | 1975 | – |
| Myanmar | 1948 | – |
| Namibia | 1990 | – |
| Nauru | 1968 | – |
| Nicaragua | 1821 | – |
| Niger | 1960 | – |
| Nigeria | 1960 | – |
| North Macedonia | 1991 | – |
| Norway | 1905 (unsure) | 1814 |
| Pakistan | 1947 | – |
| Palau | 1994 (unsure) | – |
| Panama | 1903 (unsure) | 1821 |
| Papua New Guinea | 1975 | – |
| Paraguay | 1811 | – |
| Peru | 1821 | 1824 |
| Philippines | 1946 (unsure) | 1898 |
| Poland | 1918 (unsure) | – |
| Qatar | 1971 | – |
| Republic of the Congo | 1960 | – |
| Romania | 1877 (unsure) | 1878 |
| Rwanda | 1962 | – |
| Saint Kitts and Nevis | 1983 | – |
| Saint Lucia | 1979 | – |
| Saint Vincent and the Grenadines | 1979 | – |
| Samoa | 1962 | – |
| São Tomé and Príncipe | 1975 | – |
| Senegal | 1960 | – |
| Seychelles | 1976 | – |
| Sierra Leone | 1961 | – |
| Singapore | 1965 | 1963 |
| Slovakia | 1993 | – |
| Slovenia | 1991 | – |
| Solomon Islands | 1978 | – |
| Somalia | 1960 | – |
| South Sudan | 2011 | – |
| Sri Lanka | 1948 | – |
| Sudan | 1956 | – |
| Suriname | 1975 | – |
| Syria | 1946 | – |
| Tajikistan | 1991 | – |
| Tanzania | 1961 (unsure) | 1964 |
| Timor-Leste | 2002 | 1975 |
| Togo | 1960 | – |
| Tonga | 1970 (unsure) | – |
| Trinidad and Tobago | 1962 | – |
| Tunisia | 1956 | – |
| Turkmenistan | 1991 | – |
| Uganda | 1962 | – |
| Ukraine | 1991 | – |
| United Arab Emirates | 1971 | – |
| United States | 1776 | 1783 |
| Uruguay | 1825 | 1828 |
| Uzbekistan | 1991 | – |
| Vanuatu | 1980 | – |
| Zambia | 1964 | – |
| Zimbabwe | 1980 | 1965 |

### Skipped (80)

**Never colonised, or a state so old that no single year is taught as its independence (31):** Andorra, Austria, Bhutan, China, Denmark, Ethiopia, France, Germany, Hungary, Iran, Italy, Japan, Liechtenstein, Luxembourg, Monaco, Nepal, Netherlands, Oman, Portugal, Russia, San Marino, Saudi Arabia, Serbia, Spain, Sweden, Switzerland, Thailand, Turkey, United Kingdom, Vatican City, Yemen.

- Austria: 1918 and 1955 both have a claim.
- Bhutan: Never colonised; the 1949 treaty with India is not taught as independence.
- Germany: Unified in 1871, reunified in 1990.
- Hungary: 1918 and 1989 both have a claim.
- Italy: Unified in 1861.
- Netherlands: 1581 and 1648 both have a claim.
- Oman: 1650 (the Portuguese expelled) is not widely taught.
- Portugal: 1143, and restored in 1640.
- Saudi Arabia: Unified in 1932, never colonised.
- Serbia: 1804, 1878 and 2006 all have a claim.
- Switzerland: 1291 is a founding legend, 1648 the recognition.
- Turkey: The republic of 1923 succeeded the Ottoman Empire; it was not a colony.
- Yemen: North 1918, South 1967, united 1990.

**Became independent step by step, with no single year (4):** Australia, Canada, New Zealand, South Africa.

- Australia: 1901, 1942 and 1986 all have a claim.
- Canada: 1867, 1931 and 1982 all have a claim.
- New Zealand: 1907 and 1947 both have a claim.
- South Africa: 1910, 1931, 1961 and 1994 all have a claim.

**Several competing years, too close together for a fair set of options (7):** Dominican Republic, Ecuador, Ireland, Malaysia, Mongolia, Venezuela, Vietnam.

- Dominican Republic: 1844 (from Haiti), 1821 (from Spain) and 1865 (restored) leave no room for options a fixed distance apart.
- Ecuador: 1809, 1822 and 1830 all have a claim.
- Ireland: 1916, 1919, 1921, 1922, 1937 and 1949 all have a claim.
- Malaysia: 1957 (Malaya) and 1963 (Malaysia) are six years apart: the right year could only ever sit in one position.
- Mongolia: 1911 and 1921 are ten years apart, exactly the spacing of the options.
- Venezuela: 1811, 1821 and 1830 are a decade apart each.
- Vietnam: 1945 (declared) and 1954 (the French leave) are nine years apart.

**Divided or disputed: the year depends on who is asked (5):** North Korea, Palestine, South Korea, Taiwan, Western Sahara.

- North Korea: 1945 (liberation) and 1948 (the republic).
- South Korea: 1945 (liberation) and 1948 (the republic).

**A territory or dependency, not an independent state (33):** Åland Islands, American Samoa, Anguilla, Aruba, Bermuda, British Virgin Islands, Cayman Islands, Cook Islands, Curaçao, Falkland Islands, Faroe Islands, French Polynesia, Greenland, Guam, Guernsey, Hong Kong, Isle of Man, Jersey, Montserrat, New Caledonia, Niue, Norfolk Island, Northern Mariana Islands, Pitcairn Islands, Puerto Rico, Saint Barthélemy, Saint Helena, Ascension and Tristan da Cunha, Saint Martin, Saint Pierre and Miquelon, Sint Maarten, Turks and Caicos Islands, United States Virgin Islands, Wallis and Futuna.

## Famous person

A person is asked about only at recognition 3, "known worldwide" (`PERSON_MIN_RECOGNITION`). Every person on file was reviewed: 81 are asked, across 50 countries, and 81 stay on file but are no longer asked. Wrong options are people of the same field (footballers against footballers, writers against writers), nearest regions first. A person claimed by two countries lists the other in `sharedWith`, and is never a wrong option for it.

Changed in the audit: Kevin De Bruyne, Paolo Maldini, Andrés Iniesta, Ferenc Puskás, Didier Drogba and Edvard Munch went down to 2 (famous to followers of their field, not to everyone). Simón Bolívar, Mark Twain, Edmund Hillary, Louis Pasteur, Victor Hugo and Constantine the Great went up to 3.

### Asked (81)

| Country | Person | Field | Also claimed by |
|---|---|---|---|
| Argentina | Lionel Messi | footballer | Spain |
| Argentina | Pope Francis | custom | – |
| Austria | Wolfgang Amadeus Mozart | musician | Germany |
| Barbados | Rihanna | musician | United States |
| Brazil | Pelé | footballer | – |
| Brazil | Ayrton Senna | athlete | – |
| Canada | Celine Dion | musician | United States |
| China | Yao Ming | athlete | – |
| Colombia | Shakira | musician | – |
| Croatia | Luka Modrić | footballer | – |
| Denmark | Hans Christian Andersen | writer | – |
| Egypt | Mohamed Salah | footballer | – |
| Egypt | Cleopatra | leader | Greece |
| France | Zinedine Zidane | footballer | – |
| France | Napoleon Bonaparte | leader | Italy |
| France | Claude Monet | artist | – |
| France | Victor Hugo | writer | Guernsey |
| France | Louis Pasteur | scientist | – |
| French Polynesia | Paul Gauguin | custom | – |
| Georgia | Joseph Stalin | leader | Russia |
| Germany | Franz Beckenbauer | footballer | – |
| Germany | Michael Schumacher | athlete | – |
| Germany | Albert Einstein | scientist | Switzerland, United States |
| Germany | Ludwig van Beethoven | musician | Austria |
| Ghana | Kofi Annan | custom | – |
| Greece | Giannis Antetokounmpo | athlete | Nigeria |
| Guernsey | Victor Hugo | custom | France |
| Hong Kong | Jackie Chan | custom | – |
| India | Mahatma Gandhi | leader | – |
| India | Sachin Tendulkar | athlete | – |
| Ireland | Conor McGregor | athlete | – |
| Italy | Leonardo da Vinci | artist | – |
| Italy | Galileo Galilei | scientist | – |
| Italy | Marco Polo | explorer | Croatia |
| Jamaica | Bob Marley | musician | – |
| Jamaica | Usain Bolt | athlete | – |
| Japan | Shohei Ohtani | athlete | – |
| Mexico | Frida Kahlo | artist | – |
| Mongolia | Genghis Khan | leader | – |
| Nepal | The Buddha | custom | – |
| Netherlands | Vincent van Gogh | artist | France |
| Netherlands | Johan Cruyff | footballer | – |
| New Zealand | Edmund Hillary | explorer | – |
| North Macedonia | Mother Teresa | custom | – |
| Norway | Erling Haaland | footballer | – |
| Norway | Magnus Carlsen | athlete | – |
| Pakistan | Malala Yousafzai | custom | – |
| Philippines | Manny Pacquiao | athlete | – |
| Poland | Marie Curie | scientist | France |
| Poland | Nicolaus Copernicus | scientist | Germany |
| Poland | Frédéric Chopin | musician | France |
| Poland | Robert Lewandowski | footballer | – |
| Portugal | Cristiano Ronaldo | footballer | – |
| Portugal | Vasco da Gama | explorer | – |
| Puerto Rico | Bad Bunny | musician | – |
| Romania | Nadia Comăneci | athlete | – |
| Russia | Leo Tolstoy | writer | – |
| Saint Kitts and Nevis | Alexander Hamilton | custom | – |
| Samoa | Robert Louis Stevenson | custom | – |
| Serbia | Novak Djokovic | athlete | – |
| Serbia | Nikola Jokić | athlete | – |
| Serbia | Constantine the Great | custom | – |
| Slovenia | Luka Dončić | athlete | – |
| Slovenia | Melania Trump | custom | – |
| South Africa | Nelson Mandela | leader | – |
| South Korea | Son Heung-min | footballer | – |
| Spain | Pablo Picasso | artist | France |
| Spain | Rafael Nadal | athlete | – |
| Sweden | ABBA | musician | – |
| Sweden | Zlatan Ibrahimović | footballer | – |
| Sweden | Björn Borg | athlete | – |
| Switzerland | Roger Federer | athlete | – |
| Tanzania | Freddie Mercury | custom | – |
| United Kingdom | William Shakespeare | writer | – |
| United Kingdom | Lewis Hamilton | athlete | – |
| United Kingdom | Isaac Newton | scientist | – |
| United Kingdom | The Beatles | musician | – |
| United Kingdom | James Cook | explorer | – |
| United States | Michael Jordan | athlete | – |
| United States | Mark Twain | writer | – |
| Venezuela | Simón Bolívar | leader | – |

### On file but not asked (81)

Raise `recognition` to 3 in `public/data/facts.json` for any you think the whole world knows.

Riyad Mahrez (Algeria), Henrikh Mkhitaryan (Armenia), Ian Thorpe (Australia), David Alaba (Austria), Marc Chagall (Belarus), Kevin De Bruyne (Belgium), Edin Džeko (Bosnia and Herzegovina), Hristo Stoichkov (Bulgaria), Samuel Eto'o (Cameroon), Francis Ngannou (Cameroon), Alphonso Davies (Canada), Cesária Évora (Cape Verde), Pablo Neruda (Chile), Alexis Sánchez (Chile), Gabriel García Márquez (Colombia), James Rodríguez (Colombia), Keylor Navas (Costa Rica), Pavel Nedvěd (Czechia), Jaromír Jágr (Czechia), Christian Eriksen (Denmark), David Ortiz (Dominican Republic), Dikembe Mutombo (DR Congo), Richard Carapaz (Ecuador), Antonio Valencia (Ecuador), Haile Gebrselassie (Ethiopia), Kimi Räikkönen (Finland), Jari Litmanen (Finland), Pierre-Emerick Aubameyang (Gabon), Khvicha Kvaratskhelia (Georgia), Michael Essien (Ghana), Kirani James (Grenada), Naby Keïta (Guinea), Ferenc Puskás (Hungary), Björk (Iceland), Ali Daei (Iran), Roy Keane (Ireland), James Joyce (Ireland), Paolo Maldini (Italy), Didier Drogba (Ivory Coast), Keisuke Honda (Japan), Gennady Golovkin (Kazakhstan), Eliud Kipchoge (Kenya), Kristaps Porziņģis (Latvia), George Weah (Liberia), Arvydas Sabonis (Lithuania), Lee Chong Wei (Malaysia), Seydou Keita (Mali), Hugo Sánchez (Mexico), Canelo Álvarez (Mexico), Charles Leclerc (Monaco), Achraf Hakimi (Morocco), Hicham El Guerrouj (Morocco), Maria Mutola (Mozambique), Jonah Lomu (New Zealand), Jay-Jay Okocha (Nigeria), Chinua Achebe (Nigeria), Hakeem Olajuwon (Nigeria), Goran Pandev (North Macedonia), Edvard Munch (Norway), Roald Amundsen (Norway), Roberto Durán (Panama), José Luis Chilavert (Paraguay), Iga Świątek (Poland), Roberto Clemente (Puerto Rico), Mutaz Barshim (Qatar), Gheorghe Hagi (Romania), Sadio Mané (Senegal), Nemanja Vidić (Serbia), Marek Hamšík (Slovakia), Jan Oblak (Slovenia), Andrés Iniesta (Spain), Miguel de Cervantes (Spain), Clarence Seedorf (Suriname), Xherdan Shaqiri (Switzerland), Emmanuel Adebayor (Togo), Dwight Yorke (Trinidad and Tobago), Ons Jabeur (Tunisia), Joshua Cheptegei (Uganda), Andriy Shevchenko (Ukraine), Christian Pulisic (United States), Luis Suárez (Uruguay).

### Skipped (180)

These countries have nobody on file who is recognisable worldwide. A weak name is worse than no question, so they are simply not asked this theme.

Afghanistan, Åland Islands, Albania, Algeria, American Samoa, Andorra, Angola, Anguilla, Antigua and Barbuda, Armenia, Aruba, Australia, Azerbaijan, Bahamas, Bahrain, Bangladesh, Belarus, Belgium, Belize, Benin, Bermuda, Bhutan, Bolivia, Bosnia and Herzegovina, Botswana, British Virgin Islands, Brunei, Bulgaria, Burkina Faso, Burundi, Cambodia, Cameroon, Cape Verde, Cayman Islands, Central African Republic, Chad, Chile, Comoros, Cook Islands, Costa Rica, Cuba, Curaçao, Cyprus, Czechia, Djibouti, Dominica, Dominican Republic, DR Congo, Ecuador, El Salvador, Equatorial Guinea, Eritrea, Estonia, Eswatini, Ethiopia, Falkland Islands, Faroe Islands, Fiji, Finland, Gabon, Gambia, Greenland, Grenada, Guam, Guatemala, Guinea, Guinea-Bissau, Guyana, Haiti, Honduras, Hungary, Iceland, Indonesia, Iran, Iraq, Isle of Man, Israel, Ivory Coast, Jersey, Jordan, Kazakhstan, Kenya, Kiribati, Kosovo, Kuwait, Kyrgyzstan, Laos, Latvia, Lebanon, Lesotho, Liberia, Libya, Liechtenstein, Lithuania, Luxembourg, Madagascar, Malawi, Malaysia, Maldives, Mali, Malta, Marshall Islands, Mauritania, Mauritius, Micronesia, Moldova, Monaco, Montenegro, Montserrat, Morocco, Mozambique, Myanmar, Namibia, Nauru, New Caledonia, Nicaragua, Niger, Nigeria, Niue, Norfolk Island, North Korea, Northern Mariana Islands, Oman, Palau, Palestine, Panama, Papua New Guinea, Paraguay, Peru, Pitcairn Islands, Qatar, Republic of the Congo, Rwanda, Saint Barthélemy, Saint Helena, Ascension and Tristan da Cunha, Saint Lucia, Saint Martin, Saint Pierre and Miquelon, Saint Vincent and the Grenadines, San Marino, São Tomé and Príncipe, Saudi Arabia, Senegal, Seychelles, Sierra Leone, Singapore, Sint Maarten, Slovakia, Solomon Islands, Somalia, South Sudan, Sri Lanka, Sudan, Suriname, Syria, Taiwan, Tajikistan, Thailand, Timor-Leste, Togo, Tonga, Trinidad and Tobago, Tunisia, Turkey, Turkmenistan, Turks and Caicos Islands, Uganda, Ukraine, United Arab Emirates, United States Virgin Islands, Uruguay, Uzbekistan, Vanuatu, Vatican City, Vietnam, Wallis and Futuna, Western Sahara, Yemen, Zambia, Zimbabwe.
