"""Optional synthetic browser smoke test. No Shop/merchant network calls.
Start npm run dev. Requires Python Playwright and Chromium.
"""
from playwright.sync_api import sync_playwright
import os, json
P = {'id':'gid://shopify/p/fixture','title':'Ocean ceramic mug','description':{'plain':'An ocean shell mug for hosting.'},'selected':[{'name':'Color','label':'Blue'}],'options':[{'name':'Color','values':[{'label':'Blue','available':True,'exists':True}]}],'variants':[{'id':'gid://shopify/ProductVariant/fixture','options':[{'name':'Color','label':'Blue'}],'price':{'amount':2400,'currency':'USD'},'availability':{'available':True},'seller':{'name':'Synthetic test merchant','domain':'synthetic.myshopify.com'},'url':'https://merchant.example.com/mug?variant=fixture'}]}
def intercept(route):
    if not route.request.url.startswith('http://127.0.0.1:4173'):
        route.abort(); return
    if '/api/shop' not in route.request.url:
        route.continue_(); return
    body=route.request.post_data_json
    if body['action']=='search': data={'products':[P],'messages':[]}
    elif body['action']=='product': data={'product':P,'messages':[]}
    elif body['action']=='checkout': data={'checkout':{'status':'requires_escalation','currency':'USD','line_items':[{'item':{'id':P['variants'][0]['id'],'title':P['title']},'quantity':1}],'totals':[{'type':'subtotal','display_text':'Items','amount':2400}],'messages':[{'type':'warning','content':'Synthetic test only. No merchant checkout exists.'}],'links':[],'continue_url':'https://merchant.example.com/checkout?synthetic=true'}}
    else: raise AssertionError('Unexpected API action')
    route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    for width,height in [(1440,1000),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},is_mobile=width<500)
        page.route('**/*',intercept)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:4173',wait_until='networkidle')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('#try-example').click()
        page.locator('.gift-card').first.wait_for()
        assert page.locator('.gift-card').count()==1
        page.get_by_role('button',name='Gift brief',exact=True).click()
        assert 'not an LLM' in page.locator('#brief-text').input_value()
        page.keyboard.press('Escape')
        page.get_by_role('button',name='Refresh & choose').click()
        page.locator('#create-checkout').wait_for()
        page.locator('#create-checkout').click()
        page.get_by_role('link',name='Review & pay at merchant').wait_for()
        assert page.get_by_role('link',name='Review & pay at merchant').get_attribute('href').endswith('synthetic=true')
        page.locator('#close-product').click()
        page.get_by_role('button',name='Not this one',exact=True).click()
        assert page.locator('.gift-card').count()==0
        page.get_by_role('button',name='Reset exclusions').click()
        assert page.locator('.gift-card').count()==1
        page.locator('#budget').fill('10');page.locator('#gift-form button[type=submit]').click()
        page.get_by_text('No honest match. And that’s okay.').wait_for()
        assert page.locator('.gift-card').count()==0
        page.locator('#recipient').fill('');page.locator('#gift-form button[type=submit]').click()
        assert page.locator('#form-errors').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors,errors
        page.close()
    browser.close()
print('PASS: synthetic desktop/mobile search, exclusions, brief, refresh, checkout handoff and validation. No live commerce calls.')
